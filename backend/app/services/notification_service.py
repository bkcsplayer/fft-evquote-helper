from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import Notification, NotificationChannel, NotificationStatus, SystemSetting
from app.services.email_service import send_email
from app.services.pdf_service import render_invoice_pdf
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


_LOGO_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}
LOGO_CID = "brand-logo"


def _brand_logo_inline_asset(logo_url: str | None) -> tuple[bytes, str] | None:
    """
    Read the brand logo off disk for a CID inline attachment: (image bytes, MIME subtype).

    Gmail (and several other clients) strip `data:` URI images from message bodies, so a
    base64-inlined <img src="data:..."> silently renders as broken there even though it's
    valid HTML. A CID-referenced inline attachment (multipart/related, Content-ID header) is
    the universally-supported alternative — same zero-network-dependency benefit, but actually
    renders in Gmail/Outlook/Apple Mail. Only applies to our own uploads (served under
    /uploads/branding/...); anything else falls back to the URL-based approach in
    _absolute_logo_url.
    """
    url = (logo_url or "").strip()
    marker = "/uploads/"
    idx = url.find(marker)
    if idx == -1:
        return None
    rel_path = url[idx + len(marker):].split("?", 1)[0]
    path = Path("uploads") / rel_path
    try:
        if not path.is_file():
            return None
        ext = path.suffix.lstrip(".").lower()
        mime = _LOGO_MIME.get(ext)
        if not mime:
            return None
        subtype = "jpeg" if ext == "jpg" else ext
        return path.read_bytes(), subtype
    except Exception:
        return None


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


def _resolve_inline_logo(db: Session) -> tuple[bytes, str] | None:
    """Re-read the brand logo bytes for attaching to an outgoing email as a CID part."""
    profile = _get_system_setting(db, "brand_profile") or {}
    if not isinstance(profile, dict):
        return None
    return _brand_logo_inline_asset(str(profile.get("logo_url") or "").strip())


def build_invoice_pdf(
    db: Session,
    *,
    kind_label: str,
    invoice_number: str,
    reference_number: str,
    bill_to_name: str,
    items: list[dict[str, Any]],
    subtotal: float,
    total: float,
    bill_to_address: str = "",
    bill_to_phone: str = "",
    gst_rate: float = 0.0,
    gst_amount: float = 0.0,
    amount_paid: float | None = None,
    due_now_label: str | None = None,
    due_now_amount: float | None = None,
    note: str | None = None,
) -> tuple[str, bytes] | None:
    """
    Render a branded invoice PDF for attaching to a payment-related email (deposit/balance/full
    invoice — never at the quote/estimate stage, before a customer has agreed to pay anything).

    Best-effort like the rest of this module: a PDF-rendering failure must never block the
    underlying notification, so this returns None (logged) instead of raising.
    """
    try:
        profile = _get_system_setting(db, "brand_profile") or {}
        if not isinstance(profile, dict):
            profile = {}
        s = get_settings()

        logo_data_uri = None
        asset = _brand_logo_inline_asset(str(profile.get("logo_url") or "").strip())
        if asset:
            data, subtype = asset
            logo_data_uri = f"data:image/{subtype};base64,{base64.b64encode(data).decode('ascii')}"

        etransfer = _get_system_setting(db, "etransfer_settings") or {}
        if not isinstance(etransfer, dict):
            etransfer = {}

        context = {
            "brand_name": s.brand_name,
            "brand_short": s.brand_short,
            "logo_data_uri": logo_data_uri,
            "kind_label": kind_label,
            "invoice_number": invoice_number,
            "invoice_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "reference_number": reference_number,
            "bill_to_name": bill_to_name,
            "bill_to_address": bill_to_address,
            "bill_to_phone": bill_to_phone,
            "items": items,
            "subtotal": float(subtotal),
            "gst_enabled": gst_amount > 0,
            "gst_rate": gst_rate,
            "gst_amount": float(gst_amount),
            "total": float(total),
            "amount_paid": float(amount_paid) if amount_paid is not None else None,
            "balance_due": float(total) - float(amount_paid) if amount_paid is not None else None,
            "due_now_label": due_now_label,
            "due_now_amount": float(due_now_amount) if due_now_amount is not None else None,
            "note": note,
            "etransfer_email": (etransfer.get("recipient_email") or "").strip() or None,
            "support_email": (str(profile.get("support_email") or "").strip() or s.brand_support_email),
            "support_phone": (str(profile.get("support_phone") or "").strip() or s.brand_support_phone),
        }
        pdf_bytes = render_invoice_pdf(context)
        return f"{invoice_number}.pdf", pdf_bytes
    except Exception:
        logger.exception("Invoice PDF generation failed (invoice_number=%s)", invoice_number)
        return None


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
        if _brand_logo_inline_asset(logo_url):
            out["logo_url"] = f"cid:{LOGO_CID}"
        else:
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
    pdf_attachment: tuple[str, bytes] | None = None,
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
        inline_images = None
        if f"cid:{LOGO_CID}" in html:
            asset = _resolve_inline_logo(db)
            if asset:
                data, subtype = asset
                inline_images = [(LOGO_CID, data, subtype)]
        attachments = None
        if pdf_attachment:
            filename, pdf_bytes = pdf_attachment
            attachments = [(filename, pdf_bytes, "pdf")]
        send_email(to_email=to_email, subject=subject, html=html, inline_images=inline_images, attachments=attachments)
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


# ─────────────────────────────────────────────────────────────────────────────────
# v3.0 new-service notifications (diagnostic / bird-netting / cleaning). Target a service booking
# or a cleaning subscription instead of a case. Best-effort: never block a booking; row recorded.
# ─────────────────────────────────────────────────────────────────────────────────
def notify_service(
    db: Session,
    *,
    template_key: str,
    to_email: str | None,
    to_phone: str | None,
    ctx: dict[str, Any],
    email_subject_fallback: str,
    email_html_fallback: str,
    sms_fallback: str,
    service_booking_id: str | None = None,
    cleaning_subscription_id: str | None = None,
    pdf_attachment: tuple[str, bytes] | None = None,
) -> None:
    """Render + send email and/or SMS for a new-service event, from DB-overridable templates.

    Email uses `email_templates[template_key]` (an inline HTML string, `{% extends "base.html" %}`
    aware) else `email_html_fallback`. SMS uses `sms_templates[template_key]` else `sms_fallback`.
    Never raises — a send/render failure is logged and recorded as a failed Notification row.

    Commits at the end: every caller invokes this as its terminal step after already committing
    its own business change (mirrors the EV notify_email/notify_sms call sites, which commit right
    after). Without this, `_record_notification`'s SAVEPOINT is never persisted — get_db() closes
    the session on request end without committing, silently discarding every Notification row.
    """
    merged = _with_brand_profile(db, ctx)

    if to_email:
        try:
            templates = _get_system_setting(db, "email_templates") or {}
            tpl = templates.get(template_key)
            if isinstance(tpl, dict) and tpl.get("html"):
                subject = str(tpl.get("subject") or email_subject_fallback)
                html = _templates_env().from_string(str(tpl["html"])).render(**merged)
            else:
                subject = email_subject_fallback
                html = _templates_env().from_string(email_html_fallback).render(**merged)
            _send_service_email(
                db,
                to_email=to_email,
                template_name=template_key,
                subject=subject,
                html=html,
                service_booking_id=service_booking_id,
                cleaning_subscription_id=cleaning_subscription_id,
                pdf_attachment=pdf_attachment,
            )
        except Exception:
            logger.exception("notify_service email failed (template=%s)", template_key)

    if to_phone:
        try:
            templates = _get_system_setting(db, "sms_templates") or {}
            tpl = templates.get(template_key)
            src = tpl["body"] if isinstance(tpl, dict) and tpl.get("body") else sms_fallback
            body = _templates_env().from_string(str(src)).render(**merged)
            _send_service_sms(
                db,
                to_phone=to_phone,
                template_name=template_key,
                body=body,
                service_booking_id=service_booking_id,
                cleaning_subscription_id=cleaning_subscription_id,
            )
        except Exception:
            logger.exception("notify_service sms failed (template=%s)", template_key)

    db.commit()


def _send_service_email(
    db: Session,
    *,
    to_email: str,
    template_name: str,
    subject: str,
    html: str,
    service_booking_id: str | None,
    cleaning_subscription_id: str | None,
    pdf_attachment: tuple[str, bytes] | None = None,
) -> Notification | None:
    n = Notification(
        service_booking_id=service_booking_id,
        cleaning_subscription_id=cleaning_subscription_id,
        channel=NotificationChannel.email,
        recipient=to_email,
        template_name=template_name,
        subject=subject,
        content=html,
        status=NotificationStatus.pending,
    )
    try:
        inline_images = None
        if f"cid:{LOGO_CID}" in html:
            asset = _resolve_inline_logo(db)
            if asset:
                data, subtype = asset
                inline_images = [(LOGO_CID, data, subtype)]
        attachments = None
        if pdf_attachment:
            filename, pdf_bytes = pdf_attachment
            attachments = [(filename, pdf_bytes, "pdf")]
        send_email(to_email=to_email, subject=subject, html=html, inline_images=inline_images, attachments=attachments)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)
        logger.warning("Service email send failed (template=%s): %s", template_name, e)
    return _record_notification(db, n)


def _send_service_sms(
    db: Session,
    *,
    to_phone: str,
    template_name: str,
    body: str,
    service_booking_id: str | None,
    cleaning_subscription_id: str | None,
) -> Notification | None:
    n = Notification(
        service_booking_id=service_booking_id,
        cleaning_subscription_id=cleaning_subscription_id,
        channel=NotificationChannel.sms,
        recipient=to_phone,
        template_name=template_name,
        subject=None,
        content=body,
        status=NotificationStatus.pending,
    )
    try:
        send_sms(to_phone=to_phone, body=body)
        n.status = NotificationStatus.sent
        n.sent_at = datetime.now(timezone.utc)
    except Exception as e:
        n.status = NotificationStatus.failed
        n.error_message = str(e)
        logger.warning("Service SMS send failed (template=%s): %s", template_name, e)
    return _record_notification(db, n)


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

