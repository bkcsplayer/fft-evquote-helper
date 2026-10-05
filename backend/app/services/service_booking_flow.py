"""v3.0 service booking flow (diagnostic / bird-netting / cleaning).

Wraps the atomic shared-pool slot booking (services/booking.py) and mirrors the result into the
new `service_bookings` / `cleaning_visits` rows + status. NEVER touches the EV Case model. All
notifications are best-effort and never block a booking.

Touchpoints (slot consumed):
  diagnostic  : customer self-books an on-site visit AT SUBMISSION (kind=diagnostic)
  bird netting: customer self-books a drone survey AT SUBMISSION (kind=bird_survey);
                admin schedules the install after approval (kind=bird_install)
  cleaning    : admin schedules each of the 4 quarterly visits (kind=cleaning)
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import (
    Appointment,
    AppointmentKind,
    AppointmentStatus,
    BirdNettingQuote,
    CleaningPaymentStatus,
    CleaningPricingStatus,
    CleaningSubscription,
    CleaningTier,
    CleaningVisit,
    CleaningVisitStatus,
    QuoteStatus,
    ServiceBooking,
    ServiceBookingStatus,
    ServiceType,
)
from app.services import booking as booking_svc
from app.services.availability import list_available_slots
from app.services.booking_config import get_booking_config
from app.services.notification_service import build_invoice_pdf, notify_service
from app.services.security import decode_token
from app.services.service_pricing import get_service_pricing, resolve_cleaning_tier
from app.utils.money import GST_RATE_PERCENT, deposit_split, suggested_rolls, to_money, with_gst
from app.utils.reference import build_prefixed_reference, current_year
from app.utils.timefmt import fmt_calgary
from app.utils.token import generate_access_token

# ── bird-netting input limits (trust boundary; flow-layer 400s, not Pydantic 422s) ──
MAX_PERIMETER_FT = 50_000
MAX_ITEM_COUNT = 1_000
MAX_SURVEY_PHOTOS = 30
MAX_NOTES_LEN = 2000
MAX_REASON_LEN = 300
# Only our own uploads may reach the customer quote page (no external links, no "..").
_SURVEY_PHOTO_RE = re.compile(r"^/uploads/services/[A-Za-z0-9_-][A-Za-z0-9._-]*$")
PREVIEW_TOKEN_SCOPE = "bird_quote_preview"
PREVIEW_TOKEN_MINUTES = 30


def _money_str(d) -> str:
    """Customer-facing amount, e.g. 1990.8 -> "1,990.80"."""
    return f"{d:,.2f}"

# ── allowed status transitions (admin-driven; quote/approve/schedule use dedicated paths) ──
DIAGNOSTIC_TRANSITIONS: dict[ServiceBookingStatus, set[ServiceBookingStatus]] = {
    ServiceBookingStatus.submitted: {ServiceBookingStatus.scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.scheduled: {ServiceBookingStatus.in_progress, ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.in_progress: {ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
}
BIRD_TRANSITIONS: dict[ServiceBookingStatus, set[ServiceBookingStatus]] = {
    ServiceBookingStatus.submitted: {ServiceBookingStatus.survey_scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.survey_scheduled: {ServiceBookingStatus.surveyed, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.surveyed: {ServiceBookingStatus.quoted, ServiceBookingStatus.cancelled},
    # quoted → surveyed = revise (withdraw the sent quote back to a draft)
    ServiceBookingStatus.quoted: {ServiceBookingStatus.approved, ServiceBookingStatus.surveyed, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.approved: {ServiceBookingStatus.install_scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.install_scheduled: {ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
}
# The generic /status endpoint may only complete or cancel a bird booking; every other stage
# moves through its dedicated action (survey result / quote send / revise / approve / schedule).
BIRD_STATUS_ENDPOINT_ALLOWED = {ServiceBookingStatus.completed, ServiceBookingStatus.cancelled}


# ── URLs ──
def _frontend_base() -> str:
    return (get_settings().frontend_url or "").rstrip("/")


def service_status_url(token: str) -> str:
    return f"{_frontend_base()}/service/status/{token}"


def bird_quote_url(token: str) -> str:
    return f"{_frontend_base()}/service/bird-netting/quote/{token}"


def cleaning_status_url(token: str) -> str:
    return f"{_frontend_base()}/service/status/{token}"


def _mark_status_changed(obj) -> None:
    obj.status_changed_at = datetime.now(timezone.utc)


# ── bird-netting helpers ──
def _get_bird_quote(db: Session, booking: ServiceBooking) -> BirdNettingQuote | None:
    return db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == booking.id)
    ).scalar_one_or_none()


def bird_invoice_items(quote) -> list[dict]:
    """Invoice line items for a bird quote (deposit + balance invoices). Sum == quote subtotal."""
    items = [{
        "description": f"Bird netting installation — {quote.roll_count} roll(s)",
        "quantity": quote.roll_count, "unit_price": f"${float(quote.roll_price_snapshot):.2f}",
        "amount": quote.roll_count * float(quote.roll_price_snapshot),
    }]
    if quote.nest_count:
        items.append({
            "description": f"Bird nest cleanup — {quote.nest_count} nest(s)",
            "quantity": quote.nest_count, "unit_price": f"${float(quote.nest_fee_snapshot):.2f}",
            "amount": quote.nest_count * float(quote.nest_fee_snapshot),
        })
    return items


def make_preview_token(booking_id) -> str:
    """30-minute admin preview of an unsent quote draft. Carries no role → cannot log in as admin."""
    exp = datetime.now(timezone.utc) + timedelta(minutes=PREVIEW_TOKEN_MINUTES)
    return jwt.encode(
        {"sub": str(booking_id), "scope": PREVIEW_TOKEN_SCOPE, "exp": int(exp.timestamp())},
        get_settings().secret_key,
        algorithm="HS256",
    )


def verify_preview_token(token: str, booking_id) -> bool:
    """True only for an unexpired token with the preview scope for exactly this booking."""
    try:
        payload = decode_token(token)  # enforces signature + exp
    except Exception:
        return False
    return payload.get("scope") == PREVIEW_TOKEN_SCOPE and payload.get("sub") == str(booking_id)


# ── reference numbers ──
def _next_reference(db: Session, *, model, prefix: str) -> str:
    year = current_year()
    like = f"{prefix}-{year}-"
    last = db.execute(
        select(model.reference_number)
        .where(model.reference_number.like(f"{like}%"))
        .order_by(model.reference_number.desc())
        .limit(1)
    ).scalar_one_or_none()
    seq = 1
    if last:
        try:
            seq = int(last.split("-")[-1]) + 1
        except Exception:
            seq = 1
    return build_prefixed_reference(prefix, year, seq)


# ── appointment helpers ──
def _active_appointments(
    db: Session, *, service_booking_id=None, cleaning_visit_id=None, kind: AppointmentKind | None = None
) -> list[Appointment]:
    stmt = select(Appointment).where(Appointment.status == AppointmentStatus.booked)
    if service_booking_id is not None:
        stmt = stmt.where(Appointment.service_booking_id == service_booking_id)
    if cleaning_visit_id is not None:
        stmt = stmt.where(Appointment.cleaning_visit_id == cleaning_visit_id)
    if kind is not None:
        stmt = stmt.where(Appointment.kind == kind)
    return db.execute(stmt).scalars().all()


def _assert_slot_offered(db: Session, config: dict, start_at: datetime) -> None:
    if not any(s == start_at for s in list_available_slots(db, config)):
        raise HTTPException(status_code=409, detail="That time is not available. Please pick another.")


def _book(db: Session, *, kind: AppointmentKind, start_at: datetime, created_by: str, **target) -> Appointment:
    config = get_booking_config(db)
    _assert_slot_offered(db, config, start_at)
    try:
        return booking_svc.book_slot(
            db, kind=kind, start_at=start_at, config=config, created_by=created_by, **target
        )
    except booking_svc.SlotUnavailable as e:
        raise HTTPException(status_code=409, detail=str(e))


# ── diagnostic / bird-netting booking ──
def create_service_booking(
    db: Session,
    *,
    service_type: ServiceType,
    customer_name: str,
    phone: str,
    email: str,
    address: str,
    panel_count: int,
    start_at: datetime,
    disclaimer_accepted_at: datetime,
    preferred_window: str | None = None,
    inverter_info: str | None = None,
    problem_description: str | None = None,
    problem_tags: list | None = None,
    photo_urls: list | None = None,
) -> ServiceBooking:
    pricing = get_service_pricing(db)

    booking = ServiceBooking(
        reference_number=_next_reference(db, model=ServiceBooking, prefix="SVC"),
        service_type=service_type,
        status=(
            ServiceBookingStatus.survey_scheduled
            if service_type == ServiceType.bird_netting
            else ServiceBookingStatus.submitted
        ),
        customer_name=customer_name,
        phone=phone,
        email=email,
        address=address,
        panel_count=panel_count,
        preferred_window=preferred_window,
        inverter_info=inverter_info,
        problem_description=problem_description,
        problem_tags=problem_tags,
        photo_urls=list(photo_urls or []),
        hourly_rate_snapshot=(
            float(pricing["diagnostic_hourly_rate"]) if service_type == ServiceType.diagnostic else None
        ),
        scheduled_at=start_at,
        access_token=generate_access_token(),
        disclaimer_accepted_at=disclaimer_accepted_at,
    )
    db.add(booking)
    db.flush()

    kind = AppointmentKind.diagnostic if service_type == ServiceType.diagnostic else AppointmentKind.bird_survey
    _book(db, kind=kind, start_at=start_at, created_by="customer", service_booking_id=booking.id)

    db.commit()
    db.refresh(booking)

    label = "Diagnostic visit" if service_type == ServiceType.diagnostic else "Bird-netting drone survey"
    notify_service(
        db,
        template_key="service_submission_confirm",
        to_email=email,
        to_phone=phone,
        ctx={
            "customer_name": customer_name,
            "reference_number": booking.reference_number,
            "service_label": label,
            "scheduled_text": fmt_calgary(start_at),
            "status_url": service_status_url(booking.access_token),
        },
        email_subject_fallback=f"We received your {label} booking",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Booking received</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, we received your '
            "{{ service_label }} booking. Reference <strong>{{ reference_number }}</strong>.</p>"
            '<p style="margin:0 0 12px 0;">Requested time: <strong>{{ scheduled_text }}</strong></p>'
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ status_url }}">Track status</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\n{{ service_label }} booked\nTime: {{ scheduled_text }}\n"
            "Ref: {{ reference_number }}\nTrack: {{ status_url }}"
        ),
        service_booking_id=str(booking.id),
    )
    return booking


def admin_schedule_booking(
    db: Session, *, booking: ServiceBooking, start_at: datetime, technician: str | None = None
) -> ServiceBooking:
    """Diagnostic: (re)confirm the visit + assign technician → status scheduled.
    Bird netting: before the survey is recorded, reschedule the drone survey (status unchanged);
    after approval, schedule the installation → status install_scheduled.
    """
    if booking.service_type == ServiceType.diagnostic:
        kind = AppointmentKind.diagnostic
        new_status = ServiceBookingStatus.scheduled
        template = "service_scheduled"
    elif booking.status == ServiceBookingStatus.survey_scheduled:
        kind = AppointmentKind.bird_survey
        new_status = ServiceBookingStatus.survey_scheduled
        template = "service_scheduled"
    elif booking.status in {ServiceBookingStatus.approved, ServiceBookingStatus.install_scheduled}:
        kind = AppointmentKind.bird_install
        new_status = ServiceBookingStatus.install_scheduled
        template = "bird_install_scheduled"
    else:
        raise HTTPException(
            status_code=400,
            detail="A time can be set only for the drone survey (before it is recorded) or the installation (after approval).",
        )

    for a in _active_appointments(db, service_booking_id=booking.id, kind=kind):
        a.status = AppointmentStatus.cancelled

    _book(db, kind=kind, start_at=start_at, created_by="admin", service_booking_id=booking.id)
    booking.scheduled_at = start_at
    if technician is not None:
        booking.technician = technician
    if booking.status != new_status:
        _mark_status_changed(booking)
    booking.status = new_status
    db.commit()
    db.refresh(booking)

    notify_service(
        db,
        template_key=template,
        to_email=booking.email,
        to_phone=booking.phone,
        ctx={
            "customer_name": booking.customer_name,
            "reference_number": booking.reference_number,
            "scheduled_text": fmt_calgary(start_at),
            "technician": booking.technician or "",
            "status_url": service_status_url(booking.access_token),
        },
        email_subject_fallback="Your service appointment is confirmed",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Appointment confirmed</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your appointment is '
            "confirmed for <strong>{{ scheduled_text }}</strong>.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ status_url }}">View status</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nAppointment confirmed\nTime: {{ scheduled_text }}\n"
            "Ref: {{ reference_number }}\nTrack: {{ status_url }}"
        ),
        service_booking_id=str(booking.id),
    )
    return booking


def _require_bird(booking: ServiceBooking) -> None:
    if booking.service_type != ServiceType.bird_netting:
        raise HTTPException(status_code=400, detail="This action applies to bird-netting bookings only.")


def _int_in_range(value, lo: int, hi: int, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not lo <= value <= hi:
        raise HTTPException(status_code=400, detail=f"{label} must be a whole number from {lo} to {hi}.")
    return value


def admin_record_survey_result(
    db: Session,
    *,
    booking: ServiceBooking,
    perimeter_ft: int,
    nest_count: int,
    notes: str | None,
    photo_urls: list,
) -> ServiceBooking:
    """Record the drone survey result (CONTEXT.md: 勘测结果) → status surveyed. No notification."""
    _require_bird(booking)
    if booking.status not in {ServiceBookingStatus.survey_scheduled, ServiceBookingStatus.surveyed}:
        raise HTTPException(status_code=400, detail="The survey result can be recorded only before a quote is sent.")
    perimeter_ft = _int_in_range(perimeter_ft, 1, MAX_PERIMETER_FT, "Perimeter (ft)")
    nest_count = _int_in_range(nest_count, 0, MAX_ITEM_COUNT, "Nest count")
    notes = (notes or "").strip() or None
    if notes is not None and len(notes) > MAX_NOTES_LEN:
        raise HTTPException(status_code=400, detail=f"Survey notes must be at most {MAX_NOTES_LEN} characters.")
    if not isinstance(photo_urls, list) or len(photo_urls) > MAX_SURVEY_PHOTOS:
        raise HTTPException(status_code=400, detail=f"At most {MAX_SURVEY_PHOTOS} survey photos are allowed.")
    for url in photo_urls:
        if not isinstance(url, str) or not _SURVEY_PHOTO_RE.match(url):
            raise HTTPException(status_code=400, detail="Survey photos must be uploaded files (/uploads/services/...).")

    booking.survey_perimeter_ft = perimeter_ft
    booking.survey_nest_count = nest_count
    booking.survey_notes = notes
    booking.survey_photo_urls = list(photo_urls)
    if booking.surveyed_at is None:
        booking.surveyed_at = datetime.now(timezone.utc)
    for a in _active_appointments(db, service_booking_id=booking.id, kind=AppointmentKind.bird_survey):
        a.status = AppointmentStatus.completed
    if booking.status != ServiceBookingStatus.surveyed:
        _mark_status_changed(booking)
    booking.status = ServiceBookingStatus.surveyed
    db.commit()
    db.refresh(booking)
    return booking


def admin_save_bird_quote_draft(
    db: Session,
    *,
    booking: ServiceBooking,
    roll_count: int,
    nest_count: int,
    roll_override_reason: str | None,
) -> BirdNettingQuote:
    """Create/update the quote draft (sent_at NULL, ADR-015). Booking status unchanged. No notification."""
    _require_bird(booking)
    if booking.status == ServiceBookingStatus.quoted:
        raise HTTPException(status_code=400, detail="Revise the sent quote first.")
    if booking.status != ServiceBookingStatus.surveyed or booking.survey_perimeter_ft is None:
        raise HTTPException(status_code=400, detail="Record the survey result first.")
    roll_count = _int_in_range(roll_count, 0, MAX_ITEM_COUNT, "Roll count")
    nest_count = _int_in_range(nest_count, 0, MAX_ITEM_COUNT, "Nest count")
    if roll_count + nest_count == 0:
        raise HTTPException(status_code=400, detail="A quote needs at least one roll or nest.")

    suggested = suggested_rolls(booking.survey_perimeter_ft)
    reason = (roll_override_reason or "").strip() or None
    if roll_count == suggested:
        reason = None
    elif reason is None:
        raise HTTPException(status_code=400, detail=f"Explain why the roll count differs from the suggested {suggested}.")
    elif len(reason) > MAX_REASON_LEN:
        raise HTTPException(status_code=400, detail=f"The reason must be at most {MAX_REASON_LEN} characters.")

    pricing = get_service_pricing(db)
    roll_price = to_money(pricing["bird_netting_roll_price"])
    nest_fee = to_money(pricing["bird_netting_nest_fee"])
    subtotal, gst, total = with_gst(roll_count * roll_price + nest_count * nest_fee)
    deposit, _ = deposit_split(total)

    quote = _get_bird_quote(db, booking)
    if quote is None:
        quote = BirdNettingQuote(booking_id=booking.id)
        db.add(quote)
    quote.roll_count = roll_count
    quote.nest_count = nest_count
    quote.roll_price_snapshot = roll_price
    quote.nest_fee_snapshot = nest_fee
    quote.subtotal = subtotal
    quote.gst_rate = GST_RATE_PERCENT
    quote.gst_amount = gst
    quote.total = total
    quote.deposit_amount = deposit
    quote.roll_override_reason = reason
    quote.status = QuoteStatus.pending
    quote.signature_data = None
    quote.signed_name = None
    quote.approved_at = None
    quote.sent_at = None
    db.commit()
    db.refresh(quote)
    return quote


def admin_send_bird_quote(db: Session, *, booking: ServiceBooking) -> BirdNettingQuote:
    """The ONLY action that notifies the customer about a quote (CONTEXT.md: 发送报价)."""
    _require_bird(booking)
    if booking.status != ServiceBookingStatus.surveyed:
        raise HTTPException(status_code=400, detail="Only a surveyed booking's quote draft can be sent.")
    quote = _get_bird_quote(db, booking)
    if quote is None or quote.sent_at is not None:
        raise HTTPException(status_code=400, detail="Save a quote draft first.")
    # The survey may have been re-recorded after the draft was saved — re-check the override rule.
    suggested = suggested_rolls(booking.survey_perimeter_ft)
    if quote.roll_count != suggested and not quote.roll_override_reason:
        raise HTTPException(
            status_code=400,
            detail=f"The survey now suggests {suggested} rolls — update the draft or explain the difference.",
        )

    quote.sent_at = datetime.now(timezone.utc)
    _mark_status_changed(booking)
    booking.status = ServiceBookingStatus.quoted
    db.commit()
    db.refresh(quote)

    notify_service(
        db,
        template_key="bird_quote_ready",
        to_email=booking.email,
        to_phone=booking.phone,
        ctx={
            "customer_name": booking.customer_name,
            "reference_number": booking.reference_number,
            "roll_count": quote.roll_count,
            "nest_count": quote.nest_count,
            "subtotal": _money_str(quote.subtotal),
            "gst_amount": _money_str(quote.gst_amount),
            "total": _money_str(quote.total),
            "deposit_amount": _money_str(quote.deposit_amount),
            "quote_url": bird_quote_url(booking.access_token),
        },
        email_subject_fallback="Your bird-netting quote is ready",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Your quote is ready</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your bird-netting quote '
            "is ready: {{ roll_count }} roll(s), {{ nest_count }} nest(s). Subtotal ${{ subtotal }} + GST "
            "${{ gst_amount }} = <strong>${{ total }}</strong> (incl. GST). A 30% deposit of "
            "${{ deposit_amount }} is due on approval.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ quote_url }}">Review &amp; approve</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nBird-netting quote ready\nTotal: ${{ total }} (incl. GST)\n"
            "Ref: {{ reference_number }}\nApprove: {{ quote_url }}"
        ),
        service_booking_id=str(booking.id),
    )
    return quote


def admin_revise_bird_quote(db: Session, *, booking: ServiceBooking) -> BirdNettingQuote:
    """Withdraw a sent, unsigned quote back to a draft (status surveyed). Row kept. No notification."""
    _require_bird(booking)
    if booking.status != ServiceBookingStatus.quoted:
        raise HTTPException(status_code=400, detail="Only a sent quote can be revised.")
    quote = _get_bird_quote(db, booking)
    if quote is None or quote.status != QuoteStatus.pending:
        raise HTTPException(status_code=400, detail="This quote is already signed.")

    quote.sent_at = None
    _mark_status_changed(booking)
    booking.status = ServiceBookingStatus.surveyed
    db.commit()
    db.refresh(quote)
    return quote


def approve_bird_quote(
    db: Session, *, booking: ServiceBooking, signature_data: str, signed_name: str
) -> BirdNettingQuote:
    quote = _get_bird_quote(db, booking)
    if not quote:
        raise HTTPException(status_code=404, detail="No quote to approve.")
    if quote.status == QuoteStatus.approved:
        return quote
    if quote.sent_at is None:
        raise HTTPException(status_code=400, detail="This quote has not been sent.")
    if booking.status != ServiceBookingStatus.quoted:
        raise HTTPException(status_code=400, detail="This quote is not awaiting approval.")

    quote.status = QuoteStatus.approved
    quote.signature_data = signature_data
    quote.signed_name = signed_name
    quote.approved_at = datetime.now(timezone.utc)
    if booking.status != ServiceBookingStatus.approved:
        _mark_status_changed(booking)
    booking.status = ServiceBookingStatus.approved
    db.commit()
    db.refresh(quote)

    # Signing approves the price and triggers the 30% deposit — the first real "pay now" moment
    # for this booking (the earlier quote email was just a proposal, no invoice attached). Shows
    # the full itemized quote for reference (what was agreed to) with the actual payable amount
    # (30%) called out separately, instead of collapsing straight to one opaque deposit line.
    deposit = to_money(quote.deposit_amount)
    pdf_attachment = build_invoice_pdf(
        db,
        kind_label="Deposit Invoice",
        invoice_number=f"{booking.reference_number}-DEP",
        reference_number=booking.reference_number,
        bill_to_name=booking.customer_name,
        bill_to_address=booking.address,
        bill_to_phone=booking.phone,
        items=bird_invoice_items(quote),
        subtotal=float(quote.subtotal),
        gst_rate=float(quote.gst_rate),  # snapshot: historical 0-tax quotes must not print a rate
        gst_amount=float(quote.gst_amount),
        total=float(quote.total),
        due_now_label="Deposit Due Now (30%)",
        due_now_amount=float(deposit),
        note="Approved project total shown above. A 30% deposit is due now to lock in your install date; the remaining 70% is invoiced separately after installation.",
    )
    notify_service(
        db,
        template_key="bird_quote_approved",
        to_email=booking.email,
        to_phone=booking.phone,
        ctx={
            "customer_name": booking.customer_name,
            "reference_number": booking.reference_number,
            "deposit_amount": _money_str(deposit),
            "status_url": service_status_url(booking.access_token),
        },
        email_subject_fallback="Your bird-netting quote is approved",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Quote approved</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, thanks for approving '
            "your bird-netting quote. A 30% deposit of <strong>${{ deposit_amount }}</strong> is due to "
            "lock in your install date — invoice attached.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ status_url }}">Track status</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nQuote approved\nDeposit due: ${{ deposit_amount }}\n"
            "Ref: {{ reference_number }}\nTrack: {{ status_url }}"
        ),
        service_booking_id=str(booking.id),
        pdf_attachment=pdf_attachment,
    )
    return quote


def admin_update_status(
    db: Session,
    *,
    booking: ServiceBooking,
    new_status: ServiceBookingStatus,
    actual_hours: float | None = None,
    hardware_involved: bool | None = None,
    completion_notes: str | None = None,
) -> ServiceBooking:
    if booking.service_type == ServiceType.bird_netting and new_status not in BIRD_STATUS_ENDPOINT_ALLOWED:
        raise HTTPException(status_code=400, detail="Use the survey / quote actions for this step.")
    transitions = (
        DIAGNOSTIC_TRANSITIONS if booking.service_type == ServiceType.diagnostic else BIRD_TRANSITIONS
    )
    allowed = transitions.get(booking.status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move {booking.service_type.value} from {booking.status.value} to {new_status.value}.",
        )

    if new_status == ServiceBookingStatus.cancelled:
        for a in _active_appointments(db, service_booking_id=booking.id):
            a.status = AppointmentStatus.cancelled

    if new_status == ServiceBookingStatus.completed:
        booking.completed_at = datetime.now().astimezone()
        if actual_hours is not None:
            booking.actual_hours = actual_hours
        if hardware_involved is not None:
            booking.hardware_involved = hardware_involved
        if completion_notes is not None:
            booking.completion_notes = completion_notes

    if booking.status != new_status:
        _mark_status_changed(booking)
    booking.status = new_status
    db.commit()
    db.refresh(booking)

    if new_status == ServiceBookingStatus.completed:
        pdf_attachment = _build_completion_invoice(db, booking=booking)
        balance_amount = ""
        quote = _get_bird_quote(db, booking) if booking.service_type == ServiceType.bird_netting else None
        if quote is not None:
            # snapshot-based, same rule as the admin view: GST-inclusive total minus the deposit
            balance_amount = _money_str(to_money(quote.total) - to_money(quote.deposit_amount))
        notify_service(
            db,
            template_key="service_completed",
            to_email=booking.email,
            to_phone=booking.phone,
            ctx={
                "customer_name": booking.customer_name,
                "reference_number": booking.reference_number,
                "status_url": service_status_url(booking.access_token),
                "balance_amount": balance_amount,
            },
            email_subject_fallback="Your service is complete",
            email_html_fallback=(
                '{% extends "base.html" %}{% block content %}'
                '<h2 style="margin:0 0 8px 0;">Service complete</h2>'
                '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your service is '
                "complete. Thank you!</p>"
                '{% if balance_amount %}<p style="margin:0 0 12px 0;">Balance due: '
                "<strong>${{ balance_amount }}</strong> — invoice attached.</p>{% endif %}"
                "{% endblock %}"
            ),
            sms_fallback=(
                "{{ brand_name }}\nService complete\nRef: {{ reference_number }}"
                "{% if balance_amount %}\nBalance due: ${{ balance_amount }}{% endif %}\nThank you!"
            ),
            service_booking_id=str(booking.id),
            pdf_attachment=pdf_attachment,
        )
    return booking


def _build_completion_invoice(db: Session, *, booking: ServiceBooking) -> tuple[str, bytes] | None:
    """Diagnostic: full invoice (hours x rate, settled on completion per SOP).
    Bird netting: balance invoice for the remaining 70% (30% deposit was already invoiced at
    approval — see approve_bird_quote())."""
    if booking.service_type == ServiceType.diagnostic:
        if not booking.actual_hours or not booking.hourly_rate_snapshot:
            return None
        hours = float(booking.actual_hours)
        rate = float(booking.hourly_rate_snapshot)
        subtotal, gst, total = with_gst(Decimal(str(booking.actual_hours)) * Decimal(str(booking.hourly_rate_snapshot)))
        return build_invoice_pdf(
            db,
            kind_label="Invoice",
            invoice_number=booking.reference_number,
            reference_number=booking.reference_number,
            bill_to_name=booking.customer_name,
            bill_to_address=booking.address,
            bill_to_phone=booking.phone,
            items=[{"description": "Solar diagnostic service", "quantity": f"{hours:g} hrs", "unit_price": f"${rate:.2f}/hr", "amount": float(subtotal)}],
            subtotal=float(subtotal),
            gst_rate=float(GST_RATE_PERCENT),
            gst_amount=float(gst),
            total=float(total),
        )

    quote = _get_bird_quote(db, booking)
    if not quote:
        return None
    return build_invoice_pdf(
        db,
        kind_label="Balance Invoice",
        invoice_number=f"{booking.reference_number}-BAL",
        reference_number=booking.reference_number,
        bill_to_name=booking.customer_name,
        bill_to_address=booking.address,
        bill_to_phone=booking.phone,
        items=bird_invoice_items(quote),
        subtotal=float(quote.subtotal),
        gst_rate=float(quote.gst_rate),
        gst_amount=float(quote.gst_amount),
        total=float(quote.total),
        amount_paid=float(quote.deposit_amount),
    )


def cancel_booking(db: Session, *, booking: ServiceBooking) -> ServiceBooking:
    for a in _active_appointments(db, service_booking_id=booking.id):
        a.status = AppointmentStatus.cancelled
    if booking.status != ServiceBookingStatus.cancelled:
        _mark_status_changed(booking)
    booking.status = ServiceBookingStatus.cancelled
    db.commit()
    db.refresh(booking)
    return booking


# ── cleaning subscriptions ──
def create_cleaning_subscription(
    db: Session,
    *,
    customer_name: str,
    phone: str,
    email: str,
    address: str,
    panel_count: int,
    start_date: date,
    disclaimer_accepted_at: datetime,
) -> CleaningSubscription:
    pricing = get_service_pricing(db)
    tier, annual_price = resolve_cleaning_tier(pricing, panel_count)
    pricing_status = (
        CleaningPricingStatus.pending_quote if annual_price is None else CleaningPricingStatus.quoted
    )

    sub = CleaningSubscription(
        reference_number=_next_reference(db, model=CleaningSubscription, prefix="CLN"),
        customer_name=customer_name,
        phone=phone,
        email=email,
        address=address,
        panel_count=panel_count,
        tier=tier,
        annual_price=annual_price,
        pricing_status=pricing_status,
        payment_status=CleaningPaymentStatus.unpaid,
        start_date=start_date,
        access_token=generate_access_token(),
        disclaimer_accepted_at=disclaimer_accepted_at,
    )
    db.add(sub)
    db.flush()
    for q in (1, 2, 3, 4):
        db.add(CleaningVisit(subscription_id=sub.id, quarter=q, status=CleaningVisitStatus.pending))
    db.commit()
    db.refresh(sub)

    pdf_attachment = None
    annual_total = ""
    if annual_price is not None:
        subtotal, gst, total = with_gst(annual_price)
        annual_total = _money_str(total)
        # Fixed price known now (tier1/tier2) -> this confirmation IS the invoice, annual fee due
        # to activate. Custom tier (pending_quote) has no price yet, so no invoice until priced.
        t1_max = int(pricing["cleaning_tier1_max_panels"])
        t2_max = int(pricing["cleaning_tier2_max_panels"])
        tier_range = f"up to {t1_max} panels" if tier == CleaningTier.tier1 else f"{t1_max + 1}–{t2_max} panels"
        pdf_attachment = build_invoice_pdf(
            db,
            kind_label="Invoice",
            invoice_number=sub.reference_number,
            reference_number=sub.reference_number,
            bill_to_name=customer_name,
            bill_to_address=address,
            bill_to_phone=phone,
            items=[{
                "description": f"Annual panel cleaning subscription ({tier.value}, 4 visits)",
                "quantity": "1", "unit_price": f"${annual_price:.2f}", "amount": float(subtotal),
            }],
            note=f"Tier: {tier.value} ({tier_range}) · Your subscription: {panel_count} panels · Includes 4 quarterly visits over the year.",
            subtotal=float(subtotal),
            gst_rate=float(GST_RATE_PERCENT),
            gst_amount=float(gst),
            total=float(total),
        )
    notify_service(
        db,
        template_key="cleaning_subscription_confirm",
        to_email=email,
        to_phone=phone,
        ctx={
            "customer_name": customer_name,
            "reference_number": sub.reference_number,
            "tier": tier.value,
            "annual_price": (f"{annual_price:.2f}" if annual_price is not None else "TBD"),
            "annual_total": annual_total,
            "status_url": cleaning_status_url(sub.access_token),
        },
        email_subject_fallback="Your solar panel cleaning subscription is confirmed",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Subscription confirmed</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, thank you for '
            "subscribing to quarterly panel cleaning. Annual price: <strong>${{ annual_price }}</strong>"
            "{% if annual_total %} + 5% GST = <strong>${{ annual_total }}</strong>{% endif %}.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ status_url }}">View subscription</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nCleaning subscription confirmed\nAnnual: ${{ annual_price }}"
            "{% if annual_total %} + 5% GST = ${{ annual_total }}{% endif %}\n"
            "Ref: {{ reference_number }}\nView: {{ status_url }}"
        ),
        cleaning_subscription_id=str(sub.id),
        pdf_attachment=pdf_attachment,
    )
    return sub


def admin_set_cleaning_price(db: Session, *, sub: CleaningSubscription, annual_price: float) -> CleaningSubscription:
    sub.annual_price = annual_price
    if sub.pricing_status != CleaningPricingStatus.quoted:
        _mark_status_changed(sub)
    sub.pricing_status = CleaningPricingStatus.quoted
    db.commit()
    db.refresh(sub)
    return sub


def admin_set_cleaning_payment(
    db: Session, *, sub: CleaningSubscription, payment_status: CleaningPaymentStatus
) -> CleaningSubscription:
    if sub.payment_status != payment_status:
        _mark_status_changed(sub)
    sub.payment_status = payment_status
    db.commit()
    db.refresh(sub)
    return sub


def admin_schedule_visit(db: Session, *, visit: CleaningVisit, start_at: datetime) -> CleaningVisit:
    for a in _active_appointments(db, cleaning_visit_id=visit.id):
        a.status = AppointmentStatus.cancelled
    _book(db, kind=AppointmentKind.cleaning, start_at=start_at, created_by="admin", cleaning_visit_id=visit.id)
    visit.scheduled_date = start_at
    visit.status = CleaningVisitStatus.notified
    db.commit()
    db.refresh(visit)

    sub = db.get(CleaningSubscription, visit.subscription_id)
    if sub:
        notify_service(
            db,
            template_key="cleaning_visit_upcoming",
            to_email=sub.email,
            to_phone=sub.phone,
            ctx={
                "customer_name": sub.customer_name,
                "reference_number": sub.reference_number,
                "quarter": visit.quarter,
                "scheduled_text": fmt_calgary(start_at),
                "status_url": cleaning_status_url(sub.access_token),
            },
            email_subject_fallback="Upcoming solar panel cleaning",
            email_html_fallback=(
                '{% extends "base.html" %}{% block content %}'
                '<h2 style="margin:0 0 8px 0;">Upcoming cleaning</h2>'
                '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your panel cleaning '
                "(Q{{ quarter }}) is scheduled for <strong>{{ scheduled_text }}</strong>. You do not need "
                "to be home.</p>"
                "{% endblock %}"
            ),
            sms_fallback=(
                "{{ brand_name }}\nUpcoming cleaning (Q{{ quarter }})\nTime: {{ scheduled_text }}\n"
                "Ref: {{ reference_number }}"
            ),
            cleaning_subscription_id=str(sub.id),
        )
    return visit


def admin_update_visit_status(
    db: Session, *, visit: CleaningVisit, status: CleaningVisitStatus, notes: str | None = None
) -> CleaningVisit:
    if status == CleaningVisitStatus.skipped:
        for a in _active_appointments(db, cleaning_visit_id=visit.id):
            a.status = AppointmentStatus.cancelled
    if status == CleaningVisitStatus.completed:
        visit.completed_at = datetime.now().astimezone()
    if notes is not None:
        visit.notes = notes
    visit.status = status
    db.commit()
    db.refresh(visit)

    if status == CleaningVisitStatus.completed:
        sub = db.get(CleaningSubscription, visit.subscription_id)
        if sub:
            notify_service(
                db,
                template_key="cleaning_visit_completed",
                to_email=sub.email,
                to_phone=sub.phone,
                ctx={
                    "customer_name": sub.customer_name,
                    "reference_number": sub.reference_number,
                    "quarter": visit.quarter,
                    "status_url": cleaning_status_url(sub.access_token),
                },
                email_subject_fallback="Your panel cleaning is complete",
                email_html_fallback=(
                    '{% extends "base.html" %}{% block content %}'
                    '<h2 style="margin:0 0 8px 0;">Cleaning complete</h2>'
                    '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your Q{{ quarter }} '
                    "panel cleaning is complete. Thank you!</p>"
                    "{% endblock %}"
                ),
                sms_fallback="{{ brand_name }}\nCleaning complete (Q{{ quarter }})\nRef: {{ reference_number }}",
                cleaning_subscription_id=str(sub.id),
            )
    return visit
