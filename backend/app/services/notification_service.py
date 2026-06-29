from __future__ import annotations

import logging
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any
from urllib.parse import urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import Notification, NotificationChannel, NotificationStatus, SystemSetting
from app.services.email_service import send_email
from app.services.sms_service import send_sms
from app.utils.url_utils import is_local_url

logger = logging.getLogger(__name__)


def _absolute_logo_url(logo_url: str | None) -> str | None:
    """
    Make a logo URL safe to embed in outgoing email.

    Email clients cannot resolve relative URLs (e.g. "/uploads/logo.png"), so anchor
    root-relative/relative paths to the public site URL. Returns None when no public
    base is available, so we never ship a guaranteed-broken <img>.
    """
    url = (logo_url or "").strip()
    if not url:
        return None
    if urlparse(url).scheme in ("http", "https"):
        return url
    s = get_settings()
    base = (s.frontend_url or s.admin_url or "").rstrip("/")
    if not base or is_local_url(base):
        return None
    return f"{base}/{url.lstrip('/')}"


def _with_branding(ctx: dict[str, Any]) -> dict[str, Any]:
    s = get_settings()
    out = dict(ctx or {})
    out.setdefault("brand_short", s.brand_short)
    out.setdefault("brand_name", s.brand_name)
    out.setdefault("brand_tagline", s.brand_tagline)
    out.setdefault("support_email", (s.brand_support_email or "").strip() or None)
    out.setdefault("support_phone", s.brand_support_phone)
    # Use an explicit logo URL only (avoid guessing a file path that may not exist).
    if "logo_url" not in out:
        out["logo_url"] = _absolute_logo_url(s.brand_logo_url)
    out.setdefault("warranty_years", 1)
    out.setdefault("year", datetime.now(timezone.utc).year)
    return out


@lru_cache(maxsize=1)
def _templates_env() -> Environment:
    # Shared by file templates and DB-stored template strings. DB templates may use
    # `{% extends "base.html" %}` or include file templates, so the loader points at app/templates.
    # Cached: a single Environment is reused across renders instead of rebuilt each call.
    return Environment(
        loader=FileSystemLoader("app/templates"),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_template(template_name: str, ctx: dict[str, Any]) -> str:
    env = _templates_env()
    tpl = env.get_template(template_name)
    return tpl.render(**_with_branding(ctx))


def _get_system_setting(db: Session, key: str) -> dict | None:
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else None


def _with_brand_profile(db: Session, ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Merge DB-managed brand profile into the rendering context.

    This allows Admin -> Settings to control contact info and logo without rebuilding containers.
    """
    out = _with_branding(ctx)
    profile = _get_system_setting(db, "brand_profile") or {}
    if not isinstance(profile, dict):
        return out

    support_email = str(profile.get("support_email") or "").strip()
    support_phone = str(profile.get("support_phone") or "").strip()
    logo_url = str(profile.get("logo_url") or "").strip()
    warranty_years = profile.get("warranty_years")

    if support_email:
        out["support_email"] = support_email
    if support_phone:
        out["support_phone"] = support_phone
    if logo_url:
        abs_logo = _absolute_logo_url(logo_url)
        # Avoid a localhost asset in production emails (won't load externally; can hurt deliverability).
        if abs_logo and is_local_url(abs_logo) and get_settings().app_env == "production":
            out["logo_url"] = None
        else:
            out["logo_url"] = abs_logo
    if isinstance(warranty_years, int) and warranty_years > 0:
        out["warranty_years"] = warranty_years

    return out


def render_email_from_db_or_files(
    db: Session,
    *,
    template_key: str,
    ctx: dict[str, Any],
    fallback_file: str,
    fallback_subject: str,
) -> tuple[str, str]:
    ctx = _with_brand_profile(db, ctx)
    templates = _get_system_setting(db, "email_templates") or {}
    tpl = templates.get(template_key)
    if isinstance(tpl, dict) and tpl.get("html"):
        subject = str(tpl.get("subject") or fallback_subject)
        html_src = str(tpl["html"])
        html = _templates_env().from_string(html_src).render(**ctx)
        return subject, html

    return fallback_subject, render_template(fallback_file, ctx)


def render_sms_from_db_or_fallback(db: Session, *, template_key: str, ctx: dict[str, Any], fallback: str) -> str:
    ctx = _with_brand_profile(db, ctx)
    templates = _get_system_setting(db, "sms_templates") or {}
    tpl = templates.get(template_key)
    if isinstance(tpl, dict) and tpl.get("body"):
        body_src = str(tpl["body"])
        return _templates_env().from_string(body_src).render(**ctx)
    return _templates_env().from_string(fallback).render(**ctx)


def notify_email(
    db: Session,
    *,
    case_id: str,
    to_email: str,
    template_name: str,
    subject: str,
    html: str,
) -> Notification:
    n = Notification(
        case_id=case_id,
        channel=NotificationChannel.email,
        recipient=to_email,
        template_name=template_name,
        subject=subject,
        content=html,
        status=NotificationStatus.pending,
        sent_at=None,
        error_message=None,
    )

    try:
        send_email(to_email=to_email, subject=subject, html=html)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)
        logger.warning("Email send failed for case %s (template=%s): %s", case_id, template_name, e)

    # Record in a SAVEPOINT so a DB failure here can never roll back the caller's business transaction.
    return _record_notification(db, n)


def notify_sms(
    db: Session,
    *,
    case_id: str,
    to_phone: str,
    template_name: str,
    body: str,
) -> Notification:
    n = Notification(
        case_id=case_id,
        channel=NotificationChannel.sms,
        recipient=to_phone,
        template_name=template_name,
        subject=None,
        content=body,
        status=NotificationStatus.pending,
        sent_at=None,
        error_message=None,
    )

    try:
        send_sms(to_phone=to_phone, body=body)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)
        logger.warning("SMS send failed for case %s (template=%s): %s", case_id, template_name, e)

    # Record in a SAVEPOINT so a DB failure here can never roll back the caller's business transaction.
    return _record_notification(db, n)


def _record_notification(db: Session, n: Notification) -> Notification | None:
    """
    Persist a Notification row inside a SAVEPOINT.

    Isolating the insert means a DB error while recording an (already-attempted) notification
    cannot poison the surrounding business transaction — the caller's commit still succeeds.
    Returns None if the row could not be recorded.
    """
    try:
        with db.begin_nested():
            db.add(n)
            db.flush()
        return n
    except Exception:
        logger.exception("Failed to record %s notification for case %s", n.channel.value, n.case_id)
        return None


def admin_notify_recipient() -> str | None:
    """Resolve the internal recipient for customer-action notifications, or None to skip."""
    s = get_settings()
    return (s.admin_notify_email or s.bootstrap_admin_email or "").strip() or None


def admin_case_url(case_id: str) -> str:
    """Build a link to the admin case detail page."""
    base = str(get_settings().admin_url or "").rstrip("/")
    return f"{base}/admin/cases/{case_id}"


def notify_admin_event(
    db: Session,
    *,
    case_id: str,
    reference_number: str,
    event_key: str,
    heading: str,
    summary: str,
    customer_nickname: str | None = None,
    customer_phone: str | None = None,
    customer_email: str | None = None,
    extra_lines: list[str] | None = None,
) -> Notification | None:
    """
    Email the internal admin recipient when a customer takes an action.

    Reuses the email channel; rows are tagged with template_name=event_key (admin_*) for audit.
    Renders from DB-overridable `email_templates[event_key]` else the generic `admin_event.html`.
    Silently skips (returns None) when no recipient is configured — consistent with "no creds = disabled".
    """
    to_email = admin_notify_recipient()
    if not to_email:
        return None

    # Admin notifications must never break the customer's request. A malformed DB-stored admin
    # template (TemplateSyntaxError/UndefinedError) or a send/record failure is logged and skipped.
    try:
        ctx = {
            "title": f"{heading} — {reference_number}",
            "top_chip": "ADMIN",
            "heading": heading,
            "summary": summary,
            "reference_number": reference_number,
            "customer_nickname": customer_nickname or "",
            "customer_phone": customer_phone or "",
            "customer_email": customer_email or "",
            "admin_case_url": admin_case_url(case_id),
            "extra_lines": [str(x) for x in (extra_lines or []) if str(x).strip()],
        }
        subject, html = render_email_from_db_or_files(
            db,
            template_key=event_key,
            ctx=ctx,
            fallback_file="admin_event.html",
            fallback_subject=f"[{get_settings().brand_short}] {heading} — {reference_number}",
        )
    except Exception:
        logger.exception("notify_admin_event render failed for case %s (event=%s)", case_id, event_key)
        return None

    return notify_email(
        db,
        case_id=case_id,
        to_email=to_email,
        template_name=event_key,
        subject=subject,
        html=html,
    )


def notify_case_status_sms(
    db: Session,
    *,
    case_id: str,
    to_phone: str,
    nickname: str,
    reference_number: str,
    status: str,
    status_url: str,
    note: str | None = None,
) -> Notification:
    status_labels = {
        "pending": "Request received",
        "survey_scheduled": "Site survey scheduled",
        "survey_completed": "Site survey completed",
        "quoting": "Preparing quote",
        "quoted": "Quote sent",
        "customer_approved": "Quote approved",
        "permit_applied": "Permit applied",
        "permit_approved": "Permit approved",
        "installation_scheduled": "Installation scheduled",
        "installed": "Installation completed",
        "completed": "Project completed",
        "cancelled": "Cancelled",
    }
    status_label = status_labels.get(status) or str(status or "").replace("_", " ").strip().title() or "Status update"
    clean_note = (note or "").strip()
    if clean_note and clean_note.lower() == status_label.lower():
        clean_note = ""
    ctx = {
        "nickname": nickname,
        "reference_number": reference_number,
        "status": status,
        "status_label": status_label,
        "status_url": status_url,
        "note": clean_note,
    }
    body = render_sms_from_db_or_fallback(
        db,
        template_key="status_update",
        ctx=ctx,
        fallback=(
            "{{ brand_name }}\n"
            "STATUS: {{ status_label }}\n"
            "Case: {{ reference_number }}"
            "{% if note %}\nNote: {{ note }}{% endif %}\n"
            "Track: {{ status_url }}"
        ),
    )
    return notify_sms(db, case_id=case_id, to_phone=to_phone, template_name="status_update", body=body)

