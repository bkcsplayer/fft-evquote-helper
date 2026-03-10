from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import Notification, NotificationChannel, NotificationStatus, SystemSetting
from app.services.email_service import send_email
from app.services.sms_service import send_sms


def _is_local_url(url: str | None) -> bool:
    if not url:
        return False
    try:
        u = urlparse(str(url))
        host = (u.hostname or "").lower()
        return host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local")
    except Exception:
        return False


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
        out["logo_url"] = (s.brand_logo_url or "").strip() or None
    out.setdefault("warranty_years", 1)
    out.setdefault("year", datetime.now(timezone.utc).year)
    return out


def _templates_env() -> Environment:
    return Environment(
        loader=FileSystemLoader("app/templates"),
        autoescape=select_autoescape(["html", "xml"]),
    )


def render_template(template_name: str, ctx: dict[str, Any]) -> str:
    env = _templates_env()
    tpl = env.get_template(template_name)
    return tpl.render(**_with_branding(ctx))


def _string_env() -> Environment:
    # For DB-stored template strings. Keep autoescape consistent with file templates.
    # Important: DB templates may use `{% extends "base.html" %}` or include file templates.
    return Environment(loader=FileSystemLoader("app/templates"), autoescape=select_autoescape(["html", "xml"]))


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
        # Avoid defaulting to a localhost asset in production emails (won't load externally; can hurt deliverability).
        if _is_local_url(logo_url) and get_settings().app_env == "production":
            out["logo_url"] = None
        else:
            out["logo_url"] = logo_url
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
        html = _string_env().from_string(html_src).render(**ctx)
        return subject, html

    return fallback_subject, render_template(fallback_file, ctx)


def render_sms_from_db_or_fallback(db: Session, *, template_key: str, ctx: dict[str, Any], fallback: str) -> str:
    ctx = _with_brand_profile(db, ctx)
    templates = _get_system_setting(db, "sms_templates") or {}
    tpl = templates.get(template_key)
    if isinstance(tpl, dict) and tpl.get("body"):
        body_src = str(tpl["body"])
        return _string_env().from_string(body_src).render(**ctx)
    return _string_env().from_string(fallback).render(**ctx)


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
    db.add(n)
    db.flush()

    try:
        send_email(to_email=to_email, subject=subject, html=html)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)

    db.add(n)
    db.flush()
    return n


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
    db.add(n)
    db.flush()

    try:
        send_sms(to_phone=to_phone, body=body)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)

    db.add(n)
    db.flush()
    return n


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

