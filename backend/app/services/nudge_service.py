"""Stalled-order nudges (14-day no-action auto-reminders).

Scans EV cases, service bookings (diagnostic/bird-netting), and cleaning subscriptions for
targets that have been "stalled" (no status change) past a threshold. Customer-side stalls get
an SMS reminder (capped at 3, then flagged for manual follow-up); our-side stalls are summarized
in a daily admin digest email. See CONTEXT.md for the 停滞/催单/球在客户/球在我们 vocabulary.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, NamedTuple
from zoneinfo import ZoneInfo

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import (
    BirdNettingQuote, Case, CaseNote, CaseStatus, CaseStatusHistory,
    CleaningPaymentStatus, CleaningPricingStatus, CleaningSubscription,
    Notification, NotificationStatus, ServiceBooking, ServiceBookingStatus, ServiceType,
    SystemSetting,
)
from app.services.notification_service import (
    _get_system_setting, _templates_env, _with_brand_profile,
    admin_case_url, notify_sms, render_sms_from_db_or_fallback,
    _send_service_email, _send_service_sms,
)
from app.services.service_booking_flow import bird_quote_url, cleaning_status_url, service_status_url

CALGARY_TZ = ZoneInfo("America/Edmonton")
NUDGE_CUSTOMER_TEMPLATE = "nudge_customer"
NUDGE_DIGEST_TEMPLATE = "nudge_admin_digest"
NUDGE_CAP = 3
NUDGE_INTERVAL_DAYS = 14
# ponytail: long-term flood protection (not a one-off), in case a future classification-table or
# clock bug misfires and marks a large batch of targets stalled at once — caps real SMS spend and
# keeps a single run bounded. Module constant, not config: the value has no reason to differ
# per-environment.
NUDGE_MAX_PER_RUN = 10
Bucket = Literal["customer", "ours", "none"]


class StalledTarget(NamedTuple):
    kind: Literal["ev", "diagnostic", "bird_netting", "cleaning"]
    id: str
    reference_number: str
    status_label: str
    stalled_days: int
    clock: datetime
    bucket: Bucket
    customer_name: str
    phone: str | None
    email: str | None
    action_text: str | None
    link: str | None
    admin_url: str | None


# ── classification tables ──
_EV_CLASSIFY: dict[CaseStatus, Bucket] = {
    CaseStatus.pending: "customer",
    CaseStatus.survey_scheduled: "none",
    CaseStatus.survey_completed: "ours",
    CaseStatus.quoting: "ours",
    CaseStatus.quoted: "customer",
    CaseStatus.customer_approved: "ours",
    CaseStatus.permit_applied: "ours",
    CaseStatus.permit_approved: "customer",
    CaseStatus.installation_scheduled: "none",
    CaseStatus.installed: "customer",
    CaseStatus.completed: "none",
    CaseStatus.cancelled: "none",
    CaseStatus.lost: "none",
}
_EV_ACTION: dict[CaseStatus, str] = {
    CaseStatus.pending: "book a site-survey time",
    CaseStatus.quoted: "review and sign your quote",
    CaseStatus.permit_approved: "book your installation time",
    CaseStatus.installed: "settle the final balance",
}

_SERVICE_CLASSIFY: dict[tuple[ServiceType, ServiceBookingStatus], Bucket] = {
    (ServiceType.diagnostic, ServiceBookingStatus.submitted): "customer",
    (ServiceType.diagnostic, ServiceBookingStatus.scheduled): "none",
    (ServiceType.diagnostic, ServiceBookingStatus.in_progress): "none",
    (ServiceType.diagnostic, ServiceBookingStatus.completed): "none",
    (ServiceType.diagnostic, ServiceBookingStatus.cancelled): "none",
    (ServiceType.bird_netting, ServiceBookingStatus.submitted): "none",
    (ServiceType.bird_netting, ServiceBookingStatus.survey_scheduled): "ours",
    (ServiceType.bird_netting, ServiceBookingStatus.quoted): "customer",
    (ServiceType.bird_netting, ServiceBookingStatus.approved): "customer",
    (ServiceType.bird_netting, ServiceBookingStatus.install_scheduled): "none",
    (ServiceType.bird_netting, ServiceBookingStatus.completed): "none",
    (ServiceType.bird_netting, ServiceBookingStatus.cancelled): "none",
}
_SERVICE_ACTION: dict[tuple[ServiceType, ServiceBookingStatus], str] = {
    (ServiceType.diagnostic, ServiceBookingStatus.submitted): "confirm your diagnostic visit time",
    (ServiceType.bird_netting, ServiceBookingStatus.quoted): "review and sign your quote",
    (ServiceType.bird_netting, ServiceBookingStatus.approved): "settle the deposit so we can schedule your install",
}

_CLEANING_CLASSIFY: dict[tuple[CleaningPricingStatus, CleaningPaymentStatus], Bucket] = {
    (CleaningPricingStatus.quoted, CleaningPaymentStatus.unpaid): "customer",
    (CleaningPricingStatus.quoted, CleaningPaymentStatus.paid): "none",
    (CleaningPricingStatus.quoted, CleaningPaymentStatus.refunded): "none",
    (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.unpaid): "ours",
    (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.paid): "ours",
    (CleaningPricingStatus.pending_quote, CleaningPaymentStatus.refunded): "none",
}
_CLEANING_ACTION = "complete payment for your cleaning subscription"


# ── pure helpers (no DB) ──
def should_nudge(stalled_days: int, sent_count: int) -> bool:
    return sent_count < NUDGE_CAP and stalled_days >= NUDGE_INTERVAL_DAYS * (sent_count + 1)


def redirect_enabled() -> bool:
    value = (get_settings().nudge_redirect or "").strip().casefold()
    return value != "off"


def resolve_recipient(is_sms: bool, real_contact: str) -> tuple[str, bool]:
    if not redirect_enabled():
        return real_contact, False
    s = get_settings()
    return (s.nudge_redirect_sms if is_sms else s.nudge_redirect_email), True


def _calgary_day_bounds_utc(now: datetime) -> tuple[datetime, datetime]:
    local = now.astimezone(CALGARY_TZ)
    start_local = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_local.astimezone(timezone.utc), (start_local + timedelta(days=1)).astimezone(timezone.utc)


# ── scan functions ──
def _apply_defensive_downgrade(bucket: Bucket, phone: str | None) -> Bucket:
    if bucket == "customer" and not phone:
        return "ours"
    return bucket


def _scan_ev(db: Session, now: datetime) -> list[StalledTarget]:
    rows = db.execute(
        select(Case, func.coalesce(func.max(CaseStatusHistory.created_at), Case.created_at))
        .outerjoin(CaseStatusHistory, CaseStatusHistory.case_id == Case.id)
        .group_by(Case.id)
    ).all()
    settings = get_settings()
    base_url = (settings.frontend_url or "").rstrip("/")
    targets: list[StalledTarget] = []
    for case, clock in rows:
        bucket = _EV_CLASSIFY.get(case.status, "none")
        if bucket == "none":
            continue
        if clock.tzinfo is None:
            clock = clock.replace(tzinfo=timezone.utc)
        customer = case.customer
        phone = customer.phone if customer else None
        bucket = _apply_defensive_downgrade(bucket, phone)
        targets.append(StalledTarget(
            kind="ev",
            id=str(case.id),
            reference_number=case.reference_number,
            status_label=case.status.value,
            stalled_days=(now - clock).days,
            clock=clock,
            bucket=bucket,
            customer_name=customer.nickname if customer else "",
            phone=phone,
            email=customer.email if customer else None,
            action_text=_EV_ACTION.get(case.status),
            link=f"{base_url}/quote/status/{case.access_token}",
            admin_url=admin_case_url(str(case.id)),
        ))
    return targets


def _scan_services(db: Session, now: datetime) -> list[StalledTarget]:
    bookings = db.execute(select(ServiceBooking)).scalars().all()
    targets: list[StalledTarget] = []
    for booking in bookings:
        key = (booking.service_type, booking.status)
        bucket = _SERVICE_CLASSIFY.get(key, "none")
        if bucket == "none":
            continue
        clock = booking.status_changed_at
        if clock.tzinfo is None:
            clock = clock.replace(tzinfo=timezone.utc)
        bucket = _apply_defensive_downgrade(bucket, booking.phone)
        is_diag = booking.service_type == ServiceType.diagnostic
        link = service_status_url(booking.access_token) if is_diag else bird_quote_url(booking.access_token)
        targets.append(StalledTarget(
            kind="diagnostic" if is_diag else "bird_netting",
            id=str(booking.id),
            reference_number=booking.reference_number,
            status_label=booking.status.value,
            stalled_days=(now - clock).days,
            clock=clock,
            bucket=bucket,
            customer_name=booking.customer_name,
            phone=booking.phone,
            email=booking.email,
            action_text=_SERVICE_ACTION.get(key),
            link=link,
            admin_url=None,
        ))
    return targets


def _scan_cleaning(db: Session, now: datetime) -> list[StalledTarget]:
    subs = db.execute(select(CleaningSubscription)).scalars().all()
    targets: list[StalledTarget] = []
    for sub in subs:
        key = (sub.pricing_status, sub.payment_status)
        bucket = _CLEANING_CLASSIFY.get(key, "none")
        if bucket == "none":
            continue
        clock = sub.status_changed_at
        if clock.tzinfo is None:
            clock = clock.replace(tzinfo=timezone.utc)
        bucket = _apply_defensive_downgrade(bucket, sub.phone)
        targets.append(StalledTarget(
            kind="cleaning",
            id=str(sub.id),
            reference_number=sub.reference_number,
            status_label=f"{sub.pricing_status.value}/{sub.payment_status.value}",
            stalled_days=(now - clock).days,
            clock=clock,
            bucket=bucket,
            customer_name=sub.customer_name,
            phone=sub.phone,
            email=sub.email,
            action_text=_CLEANING_ACTION if bucket == "customer" else None,
            link=cleaning_status_url(sub.access_token),
            admin_url=None,
        ))
    return targets


# ── Notification-table queries ──
def _target_fk_filter(target: StalledTarget):
    if target.kind == "ev":
        return Notification.case_id == target.id
    if target.kind == "cleaning":
        return Notification.cleaning_subscription_id == target.id
    return Notification.service_booking_id == target.id


def _sent_count(db: Session, target: StalledTarget) -> int:
    return db.execute(
        select(func.count()).select_from(Notification).where(
            _target_fk_filter(target),
            Notification.template_name == NUDGE_CUSTOMER_TEMPLATE,
            Notification.status == NotificationStatus.sent,
            Notification.created_at > target.clock,
        )
    ).scalar_one()


def _already_attempted_today(db: Session, target: StalledTarget, now: datetime) -> bool:
    start, end = _calgary_day_bounds_utc(now)
    return db.execute(
        select(func.count()).select_from(Notification).where(
            _target_fk_filter(target),
            Notification.template_name == NUDGE_CUSTOMER_TEMPLATE,
            Notification.created_at >= start, Notification.created_at < end,
        )
    ).scalar_one() > 0


def _digest_already_sent_today(db: Session, now: datetime) -> bool:
    start, end = _calgary_day_bounds_utc(now)
    return db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.template_name == NUDGE_DIGEST_TEMPLATE,
            Notification.created_at >= start, Notification.created_at < end,
        )
    ).scalar_one() > 0


# ── deliver functions (the ONLY two places allowed to call notify_sms / _send_service_sms /
# _send_service_email in this module) ──
def _deliver_customer_sms(db: Session, target: StalledTarget, now: datetime) -> Literal["sent", "failed"]:
    real_contact = target.phone or ""
    recipient, redirected = resolve_recipient(True, real_contact)
    body = render_sms_from_db_or_fallback(
        db, template_key=NUDGE_CUSTOMER_TEMPLATE,
        ctx={"reference_number": target.reference_number, "action_text": target.action_text, "link": target.link},
        fallback="{{ brand_name }}\nFriendly reminder — {{ reference_number }}\nWe're waiting on you to {{ action_text }}.\n{{ link }}",
    )
    if redirected:
        body = f"[→ {target.customer_name} {real_contact}] " + body
    if target.kind == "ev":
        n = notify_sms(db, case_id=target.id, to_phone=recipient, template_name=NUDGE_CUSTOMER_TEMPLATE, body=body)
    else:
        n = _send_service_sms(
            db, to_phone=recipient, template_name=NUDGE_CUSTOMER_TEMPLATE, body=body,
            service_booking_id=target.id if target.kind != "cleaning" else None,
            cleaning_subscription_id=target.id if target.kind == "cleaning" else None,
        )
    db.commit()
    return "sent" if n is not None and n.status == NotificationStatus.sent else "failed"


def _deliver_digest_email(db: Session, ctx: dict, now: datetime) -> None:
    merged = _with_brand_profile(db, ctx)
    templates = _get_system_setting(db, "email_templates") or {}
    tpl = templates.get(NUDGE_DIGEST_TEMPLATE)
    if isinstance(tpl, dict) and tpl.get("html"):
        subject = str(tpl.get("subject") or f"Stalled-order digest — {ctx['date']}")
        html = _templates_env().from_string(str(tpl["html"])).render(**merged)
    else:
        subject = f"Stalled-order digest — {ctx['date']}"
        html = _templates_env().from_string(
            '{% extends "base.html" %}{% block content %}<p>No template found.</p>{% endblock %}'
        ).render(**merged)
    s = get_settings()
    _send_service_email(
        db, to_email=s.nudge_redirect_email, template_name=NUDGE_DIGEST_TEMPLATE,
        subject=subject, html=html, service_booking_id=None, cleaning_subscription_id=None,
    )
    db.commit()


def _needs_followup_case_note(db: Session, target: StalledTarget) -> None:
    exists = db.execute(
        select(func.count()).select_from(CaseNote).where(
            CaseNote.case_id == target.id,
            CaseNote.content.like("NUDGE:%"),
            CaseNote.created_at > target.clock,
        )
    ).scalar_one() > 0
    if exists:
        return
    db.add(CaseNote(
        case_id=target.id, admin_user_id=None,
        content=f"NUDGE: reached {NUDGE_CAP} auto-reminders at {target.stalled_days} days stalled "
                f"({target.status_label}); needs manual follow-up.",
    ))
    db.commit()


def _build_digest_ctx(nudged: list[dict], our_side: list[dict], needs_followup: list[dict], now: datetime) -> dict:
    return {
        "date": now.astimezone(CALGARY_TZ).date().isoformat(),
        "nudged": nudged,
        "our_side": our_side,
        "needs_followup": needs_followup,
    }


def run_daily_nudges(db: Session, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    targets = _scan_ev(db, now) + _scan_services(db, now) + _scan_cleaning(db, now)

    # ponytail: single choke point (not inside the _scan_* helpers, so ad-hoc census/audit scripts
    # can still call _scan_* directly and see real mock counts). Production seeds ~27 MOCK- rows
    # spread over the past 6 weeks (mock_data.py) with intentionally undeliverable contacts
    # (+1555.../@example.com) — but the redirect (resolve_recipient) swaps those out for Kuo's real
    # phone/email, defeating that protection. Worse: "ours"-bucket targets have no per-day
    # idempotency gate at all (only customer-side does, via _already_attempted_today/_sent_count),
    # so without this filter every MOCK- "ours" row would resurface in the digest forever, drowning
    # out real stalled orders.
    targets = [t for t in targets if not t.reference_number.startswith("MOCK-")]

    customer_targets = [t for t in targets if t.bucket == "customer"]
    ours_targets = [t for t in targets if t.bucket == "ours"]

    nudged: list[dict] = []
    needs_followup: list[dict] = []
    customer_nudges_sent = 0
    customer_nudges_failed = 0
    skipped_today = 0
    flood_capped = 0

    for t in customer_targets:
        if _already_attempted_today(db, t, now):
            skipped_today += 1
            continue
        sent_count = _sent_count(db, t)
        if sent_count >= NUDGE_CAP:
            needs_followup.append({
                "ref": t.reference_number, "state": t.status_label, "days": t.stalled_days,
                "admin_url": t.admin_url,
            })
            if t.kind == "ev":
                _needs_followup_case_note(db, t)
            continue
        if not should_nudge(t.stalled_days, sent_count):
            continue
        if customer_nudges_sent + customer_nudges_failed >= NUDGE_MAX_PER_RUN:
            # Flood gate does NOT write a Notification row and does NOT touch
            # _already_attempted_today's bookkeeping for this target — same-day reruns or the next
            # day's cron will pick it right back up and keep draining the backlog, NUDGE_MAX_PER_RUN
            # at a time. Idempotency is preserved by construction: nothing was recorded as attempted.
            flood_capped += 1
            continue
        result = _deliver_customer_sms(db, t, now)
        if result == "sent":
            customer_nudges_sent += 1
            nudged.append({
                "ref": t.reference_number, "state": t.status_label, "days": t.stalled_days,
                "count": sent_count + 1, "intended": f"{t.customer_name} {t.phone or t.email or ''}",
                "redirected": redirect_enabled(), "admin_url": t.admin_url,
            })
        else:
            customer_nudges_failed += 1

    our_side_ctx = [
        {"ref": t.reference_number, "state": t.status_label, "days": t.stalled_days, "admin_url": t.admin_url}
        for t in ours_targets
    ]

    digest_sent = False
    if (nudged or our_side_ctx or needs_followup) and not _digest_already_sent_today(db, now):
        ctx = _build_digest_ctx(nudged, our_side_ctx, needs_followup, now)
        _deliver_digest_email(db, ctx, now)
        digest_sent = True

    return {
        "date": now.astimezone(CALGARY_TZ).date().isoformat(),
        "scanned": len(targets),
        "customer_nudges_sent": customer_nudges_sent,
        "customer_nudges_failed": customer_nudges_failed,
        "skipped_today": skipped_today,
        "our_side": len(ours_targets),
        "needs_followup": len(needs_followup),
        "digest_sent": digest_sent,
        "flood_capped": flood_capped,
    }
