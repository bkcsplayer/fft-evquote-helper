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

from datetime import date, datetime

from fastapi import HTTPException
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
from app.services.service_pricing import get_service_pricing, resolve_cleaning_tier
from app.utils.reference import build_prefixed_reference, current_year
from app.utils.token import generate_access_token

# ── allowed status transitions (admin-driven; quote/approve/schedule use dedicated paths) ──
DIAGNOSTIC_TRANSITIONS: dict[ServiceBookingStatus, set[ServiceBookingStatus]] = {
    ServiceBookingStatus.submitted: {ServiceBookingStatus.scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.scheduled: {ServiceBookingStatus.in_progress, ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.in_progress: {ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
}
BIRD_TRANSITIONS: dict[ServiceBookingStatus, set[ServiceBookingStatus]] = {
    ServiceBookingStatus.submitted: {ServiceBookingStatus.survey_scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.survey_scheduled: {ServiceBookingStatus.quoted, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.quoted: {ServiceBookingStatus.approved, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.approved: {ServiceBookingStatus.install_scheduled, ServiceBookingStatus.cancelled},
    ServiceBookingStatus.install_scheduled: {ServiceBookingStatus.completed, ServiceBookingStatus.cancelled},
}


# ── URLs ──
def _frontend_base() -> str:
    return (get_settings().frontend_url or "").rstrip("/")


def service_status_url(token: str) -> str:
    return f"{_frontend_base()}/service/status/{token}"


def bird_quote_url(token: str) -> str:
    return f"{_frontend_base()}/service/bird-netting/quote/{token}"


def cleaning_status_url(token: str) -> str:
    return f"{_frontend_base()}/service/status/{token}"


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
            "scheduled_text": start_at.astimezone().strftime("%Y-%m-%d %H:%M %Z"),
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
    Bird netting (after approval): schedule the installation → status install_scheduled.
    """
    if booking.service_type == ServiceType.diagnostic:
        kind = AppointmentKind.diagnostic
        new_status = ServiceBookingStatus.scheduled
        template = "service_scheduled"
    else:
        if booking.status not in {ServiceBookingStatus.approved, ServiceBookingStatus.install_scheduled}:
            raise HTTPException(status_code=400, detail="Install can be scheduled only after the quote is approved.")
        kind = AppointmentKind.bird_install
        new_status = ServiceBookingStatus.install_scheduled
        template = "bird_install_scheduled"

    for a in _active_appointments(db, service_booking_id=booking.id, kind=kind):
        a.status = AppointmentStatus.cancelled

    _book(db, kind=kind, start_at=start_at, created_by="admin", service_booking_id=booking.id)
    booking.scheduled_at = start_at
    if technician is not None:
        booking.technician = technician
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
            "scheduled_text": start_at.astimezone().strftime("%Y-%m-%d %H:%M %Z"),
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


def admin_create_bird_quote(
    db: Session, *, booking: ServiceBooking, roll_count: int, nest_count: int
) -> BirdNettingQuote:
    if booking.service_type != ServiceType.bird_netting:
        raise HTTPException(status_code=400, detail="Quotes apply to bird-netting bookings only.")
    if booking.status not in {ServiceBookingStatus.survey_scheduled, ServiceBookingStatus.quoted}:
        raise HTTPException(status_code=400, detail="A quote can be issued after the drone survey.")

    pricing = get_service_pricing(db)
    roll_price = float(pricing["bird_netting_roll_price"])
    nest_fee = float(pricing["bird_netting_nest_fee"])
    total = roll_count * roll_price + nest_count * nest_fee

    quote = db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == booking.id)
    ).scalar_one_or_none()
    if quote is None:
        quote = BirdNettingQuote(booking_id=booking.id)
        db.add(quote)
    quote.roll_count = roll_count
    quote.nest_count = nest_count
    quote.roll_price_snapshot = roll_price
    quote.nest_fee_snapshot = nest_fee
    quote.total = total
    quote.status = QuoteStatus.pending
    quote.signature_data = None
    quote.signed_name = None
    quote.approved_at = None

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
            "roll_count": roll_count,
            "nest_count": nest_count,
            "total": f"{total:.2f}",
            "quote_url": bird_quote_url(booking.access_token),
        },
        email_subject_fallback="Your bird-netting quote is ready",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Your quote is ready</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your bird-netting quote '
            "is ready: {{ roll_count }} roll(s), {{ nest_count }} nest(s), total "
            "<strong>${{ total }}</strong>.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ quote_url }}">Review &amp; approve</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nBird-netting quote ready\nTotal: ${{ total }}\n"
            "Ref: {{ reference_number }}\nApprove: {{ quote_url }}"
        ),
        service_booking_id=str(booking.id),
    )
    return quote


def approve_bird_quote(
    db: Session, *, booking: ServiceBooking, signature_data: str, signed_name: str
) -> BirdNettingQuote:
    quote = db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == booking.id)
    ).scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="No quote to approve.")
    if quote.status == QuoteStatus.approved:
        return quote
    if booking.status != ServiceBookingStatus.quoted:
        raise HTTPException(status_code=400, detail="This quote is not awaiting approval.")

    quote.status = QuoteStatus.approved
    quote.signature_data = signature_data
    quote.signed_name = signed_name
    quote.approved_at = datetime.now().astimezone()
    booking.status = ServiceBookingStatus.approved
    db.commit()
    db.refresh(quote)

    # Signing approves the price and triggers the 30% deposit — the first real "pay now" moment
    # for this booking (the earlier quote email was just a proposal, no invoice attached). Shows
    # the full itemized quote for reference (what was agreed to) with the actual payable amount
    # (30%) called out separately, instead of collapsing straight to one opaque deposit line.
    deposit_amount = float(quote.total) * 0.30
    quote_items = [{
        "description": f"Bird netting installation — {quote.roll_count} roll(s)",
        "quantity": quote.roll_count, "unit_price": f"${float(quote.roll_price_snapshot):.2f}",
        "amount": quote.roll_count * float(quote.roll_price_snapshot),
    }]
    if quote.nest_count:
        quote_items.append({
            "description": f"Bird nest cleanup — {quote.nest_count} nest(s)",
            "quantity": quote.nest_count, "unit_price": f"${float(quote.nest_fee_snapshot):.2f}",
            "amount": quote.nest_count * float(quote.nest_fee_snapshot),
        })
    pdf_attachment = build_invoice_pdf(
        db,
        kind_label="Deposit Invoice",
        invoice_number=f"{booking.reference_number}-DEP",
        reference_number=booking.reference_number,
        bill_to_name=booking.customer_name,
        bill_to_address=booking.address,
        bill_to_phone=booking.phone,
        items=quote_items,
        subtotal=float(quote.total),
        total=float(quote.total),
        due_now_label="Deposit Due Now (30%)",
        due_now_amount=deposit_amount,
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
            "deposit_amount": f"{deposit_amount:.2f}",
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

    booking.status = new_status
    db.commit()
    db.refresh(booking)

    if new_status == ServiceBookingStatus.completed:
        pdf_attachment = _build_completion_invoice(db, booking=booking)
        notify_service(
            db,
            template_key="service_completed",
            to_email=booking.email,
            to_phone=booking.phone,
            ctx={
                "customer_name": booking.customer_name,
                "reference_number": booking.reference_number,
                "status_url": service_status_url(booking.access_token),
            },
            email_subject_fallback="Your service is complete",
            email_html_fallback=(
                '{% extends "base.html" %}{% block content %}'
                '<h2 style="margin:0 0 8px 0;">Service complete</h2>'
                '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, your service is '
                "complete. Thank you!</p>"
                "{% endblock %}"
            ),
            sms_fallback="{{ brand_name }}\nService complete\nRef: {{ reference_number }}\nThank you!",
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
        total = hours * rate
        return build_invoice_pdf(
            db,
            kind_label="Invoice",
            invoice_number=booking.reference_number,
            reference_number=booking.reference_number,
            bill_to_name=booking.customer_name,
            bill_to_address=booking.address,
            bill_to_phone=booking.phone,
            items=[{"description": "Solar diagnostic service", "quantity": f"{hours:g} hrs", "unit_price": f"${rate:.2f}/hr", "amount": total}],
            subtotal=total,
            total=total,
        )

    quote = db.execute(select(BirdNettingQuote).where(BirdNettingQuote.booking_id == booking.id)).scalar_one_or_none()
    if not quote:
        return None
    deposit_paid = float(quote.total) * 0.30
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
    return build_invoice_pdf(
        db,
        kind_label="Balance Invoice",
        invoice_number=f"{booking.reference_number}-BAL",
        reference_number=booking.reference_number,
        bill_to_name=booking.customer_name,
        bill_to_address=booking.address,
        bill_to_phone=booking.phone,
        items=items,
        subtotal=float(quote.total),
        total=float(quote.total),
        amount_paid=deposit_paid,
    )


def cancel_booking(db: Session, *, booking: ServiceBooking) -> ServiceBooking:
    for a in _active_appointments(db, service_booking_id=booking.id):
        a.status = AppointmentStatus.cancelled
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
    if annual_price is not None:
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
                "quantity": "1", "unit_price": f"${annual_price:.2f}", "amount": annual_price,
            }],
            note=f"Tier: {tier.value} ({tier_range}) · Your subscription: {panel_count} panels · Includes 4 quarterly visits over the year.",
            subtotal=annual_price,
            total=annual_price,
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
            "status_url": cleaning_status_url(sub.access_token),
        },
        email_subject_fallback="Your solar panel cleaning subscription is confirmed",
        email_html_fallback=(
            '{% extends "base.html" %}{% block content %}'
            '<h2 style="margin:0 0 8px 0;">Subscription confirmed</h2>'
            '<p class="muted" style="margin:0 0 12px 0;">Hi {{ customer_name }}, thank you for '
            "subscribing to quarterly panel cleaning. Annual price: <strong>${{ annual_price }}</strong>.</p>"
            '<p style="margin:0 0 12px 0;"><a class="btn" href="{{ status_url }}">View subscription</a></p>'
            "{% endblock %}"
        ),
        sms_fallback=(
            "{{ brand_name }}\nCleaning subscription confirmed\nAnnual: ${{ annual_price }}\n"
            "Ref: {{ reference_number }}\nView: {{ status_url }}"
        ),
        cleaning_subscription_id=str(sub.id),
        pdf_attachment=pdf_attachment,
    )
    return sub


def admin_set_cleaning_price(db: Session, *, sub: CleaningSubscription, annual_price: float) -> CleaningSubscription:
    sub.annual_price = annual_price
    sub.pricing_status = CleaningPricingStatus.quoted
    db.commit()
    db.refresh(sub)
    return sub


def admin_set_cleaning_payment(
    db: Session, *, sub: CleaningSubscription, payment_status: CleaningPaymentStatus
) -> CleaningSubscription:
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
                "scheduled_text": start_at.astimezone().strftime("%Y-%m-%d %H:%M %Z"),
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
