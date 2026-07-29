"""Seed / purge demo data so every page has something to render.

Production holds exactly ONE real record (FFT-2026-0002, Raju). Everything this script
creates is disposable and tagged two ways so it can never be confused with real data:

  * every reference number starts with ``MOCK-``
  * every customer-visible name starts with ``Mock-``
  * contact details are unroutable on purpose (``@example.com`` / ``+1555…``) so that a
    notification fired by accident cannot reach a real person

Purge is driven by those two markers alone, so nothing real can be caught by it.

Run (the image does not contain this directory, so feed it over stdin):

    docker compose -f docker-compose.vps.yml exec -T backend python - seed  < backend/scripts/mock_data.py
    docker compose -f docker-compose.vps.yml exec -T backend python - purge < backend/scripts/mock_data.py

``seed`` purges first, so it is safe to re-run.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.models import (
    AdminUser,
    Appointment,
    AppointmentKind,
    AppointmentStatus,
    BirdNettingQuote,
    Case,
    CaseNote,
    CaseStatus,
    CaseStatusHistory,
    CleaningPaymentStatus,
    CleaningPricingStatus,
    CleaningSubscription,
    CleaningTier,
    CleaningVisit,
    CleaningVisitStatus,
    Customer,
    Installation,
    InstallType,
    Notification,
    NotificationChannel,
    NotificationStatus,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    Permit,
    PermitStatus,
    Quote,
    QuoteAddon,
    QuoteSignature,
    QuoteStatus,
    ServiceBooking,
    ServiceBookingStatus,
    ServiceType,
    Survey,
)

MOCK_REF_PREFIX = "MOCK-"
MOCK_NAME_PREFIX = "Mock-"

# Fixed "today" so re-running the seed produces the same relative timeline.
TODAY = datetime(2026, 7, 28, tzinfo=timezone.utc)
# 1x1 transparent PNG — a real data URI so signature <img> tags render instead of breaking.
SIG_PNG = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlE"
    "QVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def days(n: int, hour: int = 0) -> datetime:
    return TODAY + timedelta(days=n, hours=hour)


# Appointments are inserted directly, bypassing services/booking.py — so they consume the
# shared per-(day, hour) capacity pool without being checked against it. Everything except the
# cleaning "notified" visits is dated in the past, where it cannot block a real booking; those
# three are spread one per week and one per hour so a real customer loses at most one slot in a
# given hour. Move CLEANING_NOTIFIED_OFFSET negative if even that is unwanted.
CLEANING_NOTIFIED_OFFSET = 6      # days from TODAY for subscription #1's upcoming visit
CLEANING_NOTIFIED_STRIDE = 7      # each further subscription lands a week later
BUSINESS_HOUR_UTC = 16            # 10:00 in Calgary (MDT) — appointments land in working hours


def token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex


# ─────────────────────────────── purge ────────────────────────────────


def purge(db: Session) -> None:
    """Delete every mock row, children first.

    Two markers are accepted so that pre-existing hand-made test records can be adopted by
    renaming their customer alone (renaming their reference number would let the next real
    case reuse a sequence number that was already handed out).
    """
    mock_customer_ids = db.execute(
        select(Customer.id).where(Customer.nickname.like(f"{MOCK_NAME_PREFIX}%"))
    ).scalars().all()
    cases = db.execute(
        select(Case).where(
            Case.reference_number.like(f"{MOCK_REF_PREFIX}%")
            | Case.customer_id.in_(mock_customer_ids or [uuid.uuid4()])
        )
    ).scalars().all()
    case_ids = [c.id for c in cases]
    customer_ids = {c.customer_id for c in cases}

    bookings = db.execute(
        select(ServiceBooking).where(
            ServiceBooking.reference_number.like(f"{MOCK_REF_PREFIX}%")
            | ServiceBooking.customer_name.like(f"{MOCK_NAME_PREFIX}%")
        )
    ).scalars().all()
    booking_ids = [b.id for b in bookings]

    subs = db.execute(
        select(CleaningSubscription).where(
            CleaningSubscription.reference_number.like(f"{MOCK_REF_PREFIX}%")
            | CleaningSubscription.customer_name.like(f"{MOCK_NAME_PREFIX}%")
        )
    ).scalars().all()
    sub_ids = [s.id for s in subs]
    visits = db.execute(
        select(CleaningVisit).where(CleaningVisit.subscription_id.in_(sub_ids or [uuid.uuid4()]))
    ).scalars().all()
    visit_ids = [v.id for v in visits]

    quotes = db.execute(
        select(Quote).where(Quote.case_id.in_(case_ids or [uuid.uuid4()]))
    ).scalars().all()
    quote_ids = [q.id for q in quotes]

    def wipe(model, column, ids):
        if not ids:
            return 0
        rows = db.execute(select(model).where(column.in_(ids))).scalars().all()
        for r in rows:
            db.delete(r)
        return len(rows)

    counts = {
        "appointments(case)": wipe(Appointment, Appointment.case_id, case_ids),
        "appointments(service)": wipe(Appointment, Appointment.service_booking_id, booking_ids),
        "appointments(cleaning)": wipe(Appointment, Appointment.cleaning_visit_id, visit_ids),
        "quote_signatures": wipe(QuoteSignature, QuoteSignature.quote_id, quote_ids),
        "quote_addons": wipe(QuoteAddon, QuoteAddon.quote_id, quote_ids),
        "quotes": wipe(Quote, Quote.case_id, case_ids),
        "surveys": wipe(Survey, Survey.case_id, case_ids),
        "permits": wipe(Permit, Permit.case_id, case_ids),
        "installations": wipe(Installation, Installation.case_id, case_ids),
        "payments": wipe(Payment, Payment.case_id, case_ids),
        "case_notes": wipe(CaseNote, CaseNote.case_id, case_ids),
        "case_status_history": wipe(CaseStatusHistory, CaseStatusHistory.case_id, case_ids),
        "notifications(case)": wipe(Notification, Notification.case_id, case_ids),
        "notifications(service)": wipe(Notification, Notification.service_booking_id, booking_ids),
        "notifications(cleaning)": wipe(Notification, Notification.cleaning_subscription_id, sub_ids),
        "bird_netting_quotes": wipe(BirdNettingQuote, BirdNettingQuote.booking_id, booking_ids),
    }
    db.flush()
    counts["cleaning_visits"] = wipe(CleaningVisit, CleaningVisit.subscription_id, sub_ids)
    db.flush()
    for s in subs:
        db.delete(s)
    for b in bookings:
        db.delete(b)
    for c in cases:
        db.delete(c)
    db.flush()
    counts["cleaning_subscriptions"] = len(subs)
    counts["service_bookings"] = len(bookings)
    counts["cases"] = len(cases)
    counts["customers"] = wipe(Customer, Customer.id, list(customer_ids))
    db.commit()
    total = sum(counts.values())
    print(f"purged {total} rows")
    for k, v in counts.items():
        if v:
            print(f"  {k:<26} {v}")


# ─────────────────────────────── seed ────────────────────────────────

# (suffix, nickname, status, charger, ev, address)
EV_CASES = [
    ("01", "Alice",  CaseStatus.pending,                "Tesla Wall Connector", "Tesla Model 3",   "12 Sunridge Way NE"),
    ("02", "Bruno",  CaseStatus.survey_scheduled,       "ChargePoint Home Flex", "Ford F-150 Lightning", "88 Evergreen Dr SW"),
    ("03", "Chen",   CaseStatus.survey_completed,       "Grizzl-E Classic",     "Hyundai Ioniq 5", "451 Panorama Hills Blvd NW"),
    ("04", "Dara",   CaseStatus.quoting,                "Tesla Wall Connector", "Tesla Model Y",   "9 Auburn Bay Link SE"),
    ("05", "Elena",  CaseStatus.quoted,                 "Emporia Level 2",      "Kia EV6",         "230 Sage Hill Grove NW"),
    ("06", "Farid",  CaseStatus.customer_approved,      "ChargePoint Home Flex", "BMW i4",         "77 Cranston Ave SE"),
    ("07", "Grace",  CaseStatus.permit_applied,         "Grizzl-E Classic",     "Volkswagen ID.4", "14 Silverado Plains Cl SW"),
    ("08", "Hassan", CaseStatus.permit_approved,        "Tesla Wall Connector", "Tesla Model X",   "302 Mahogany Blvd SE"),
    ("09", "Ivy",    CaseStatus.installation_scheduled, "Emporia Level 2",      "Nissan Ariya",    "66 Nolan Hill Dr NW"),
    ("10", "Jonas",  CaseStatus.installed,              "ChargePoint Home Flex", "Rivian R1T",     "5 Legacy Village Way SE"),
    ("11", "Kiran",  CaseStatus.completed,              "Grizzl-E Classic",     "Chevrolet Bolt",  "121 Redstone Blvd NE"),
    ("12", "Lena",   CaseStatus.cancelled,              "Tesla Wall Connector", "Tesla Model 3",   "40 Copperfield Gate SE"),
    ("13", "Mateo",  CaseStatus.lost,                   "Emporia Level 2",      "Polestar 2",      "18 Walden Sq SE"),
]

# Order of the happy path, used to synthesise a plausible status history for each case.
EV_FLOW = [
    CaseStatus.pending,
    CaseStatus.survey_scheduled,
    CaseStatus.survey_completed,
    CaseStatus.quoting,
    CaseStatus.quoted,
    CaseStatus.customer_approved,
    CaseStatus.permit_applied,
    CaseStatus.permit_approved,
    CaseStatus.installation_scheduled,
    CaseStatus.installed,
    CaseStatus.completed,
]


def reached(status: CaseStatus, target: CaseStatus) -> bool:
    """True when a case in `status` has already passed through `target`."""
    if status in (CaseStatus.cancelled, CaseStatus.lost):
        # Both mock exit cases are abandoned right after the quote was sent.
        return EV_FLOW.index(target) <= EV_FLOW.index(CaseStatus.quoted)
    return EV_FLOW.index(target) <= EV_FLOW.index(status)


def seed_ev(db: Session, admin_id) -> None:
    for idx, (sfx, name, status, charger, ev, address) in enumerate(EV_CASES):
        offset = -40 + idx  # spread creation dates across the past ~6 weeks
        customer = Customer(
            nickname=f"{MOCK_NAME_PREFIX}{name}",
            phone=f"+15550{100 + idx:04d}",
            email=f"mock+ev{sfx}@example.com",
        )
        db.add(customer)
        db.flush()

        case = Case(
            reference_number=f"{MOCK_REF_PREFIX}EV-{sfx}",
            customer_id=customer.id,
            status=status,
            charger_brand=charger,
            ev_brand=ev,
            install_address=address,
            preferred_install_date=days(offset + 30).date(),
            referrer="Mock-Referral" if idx % 3 == 0 else None,
            preferred_survey_slots={"slots": []},
            notes=f"{MOCK_NAME_PREFIX}demo case — status {status.value}. Safe to delete.",
            access_token=token(),
            created_at=days(offset),
            updated_at=days(offset + 2),
        )
        db.add(case)
        db.flush()

        # status history along the flow up to the current status
        stamp = days(offset)
        prev = None
        chain = [s for s in EV_FLOW if reached(status, s)]
        if status in (CaseStatus.cancelled, CaseStatus.lost):
            chain = chain + [status]
        for s in chain:
            db.add(CaseStatusHistory(
                case_id=case.id, from_status=prev.value if prev else None, to_status=s.value,
                changed_by=admin_id if prev else None,
                note=f"{MOCK_NAME_PREFIX}demo transition to {s.value}", created_at=stamp,
            ))
            prev = s
            stamp = stamp + timedelta(days=1, hours=3)

        if reached(status, CaseStatus.survey_scheduled):
            done = reached(status, CaseStatus.survey_completed)
            survey = Survey(
                case_id=case.id,
                scheduled_date=days(offset + 3),
                completed_at=days(offset + 3, ) + timedelta(hours=2) if done else None,
                deposit_amount=99.00,
                deposit_paid=done,
                deposit_reported=done,
                deposit_reported_at=days(offset + 2) if done else None,
                survey_notes=f"{MOCK_NAME_PREFIX}panel 100A, garage wall mount" if done else None,
            )
            db.add(survey)
            db.add(Appointment(
                case_id=case.id, kind=AppointmentKind.survey,
                start_at=days(offset + 3, BUSINESS_HOUR_UTC), duration_min=60,
                status=AppointmentStatus.completed if done else AppointmentStatus.booked,
                created_by="customer",
            ))
            if done:
                db.add(Payment(
                    case_id=case.id, kind=PaymentKind.deposit, method=PaymentMethod.etransfer,
                    amount=99.00, status=PaymentStatus.received, received_at=days(offset + 2),
                    recorded_by=admin_id, note=f"{MOCK_NAME_PREFIX}survey deposit",
                ))

        if reached(status, CaseStatus.quoted):
            has_addon = idx % 2 == 0
            base, addon_price = 899.00, 180.00
            permit_fee, credit = 0.00, 99.00
            subtotal = base + (addon_price if has_addon else 0) + permit_fee - credit
            gst = round(subtotal * 0.05, 2)
            quote = Quote(
                case_id=case.id, version=1, install_type=InstallType.surface_mount,
                base_price=base, extra_distance_meters=0, extra_distance_rate=0, extra_distance_cost=0,
                permit_fee=permit_fee, survey_credit=credit, subtotal=subtotal,
                gst_rate=5.00, gst_amount=gst, total=round(subtotal + gst, 2),
                admin_notes=f"{MOCK_NAME_PREFIX}demo quote", sent_at=days(offset + 5),
                is_active=True, created_by=admin_id,
            )
            db.add(quote)
            db.flush()
            if has_addon:
                db.add(QuoteAddon(
                    quote_id=quote.id, name=f"{MOCK_NAME_PREFIX}Conduit run (10m)",
                    price=addon_price, description="Demo add-on line",
                ))
            if reached(status, CaseStatus.customer_approved):
                db.add(QuoteSignature(
                    quote_id=quote.id, signature_data=SIG_PNG,
                    signed_name=f"{MOCK_NAME_PREFIX}{name}", signed_at=days(offset + 6),
                    ip_address="203.0.113.7", signed_language="en",
                    terms_snapshot="Demo terms snapshot.",
                ))

        if reached(status, CaseStatus.permit_applied):
            approved = reached(status, CaseStatus.permit_approved)
            db.add(Permit(
                case_id=case.id, permit_number=f"{MOCK_REF_PREFIX}PMT-{sfx}",
                applied_date=days(offset + 7).date(),
                expected_approval_date=days(offset + 14).date(),
                actual_approval_date=days(offset + 12).date() if approved else None,
                status=PermitStatus.approved if approved else PermitStatus.applied,
                notes=f"{MOCK_NAME_PREFIX}demo permit",
            ))

        if reached(status, CaseStatus.installation_scheduled):
            done = reached(status, CaseStatus.installed)
            finished = reached(status, CaseStatus.completed)
            db.add(Installation(
                case_id=case.id, scheduled_date=days(offset + 18),
                completed_at=days(offset + 18) + timedelta(hours=4) if done else None,
                completion_email_sent=finished,
                notes=f"{MOCK_NAME_PREFIX}demo installation",
                installed_items="Charger, 40A breaker, 8m conduit" if done else None,
                wire_gauge="6 AWG" if done else None,
                max_charging_amps=40 if done else None,
                test_passed=done,
                test_notes="Demo test OK" if done else None,
            ))
            db.add(Appointment(
                case_id=case.id, kind=AppointmentKind.install,
                start_at=days(offset + 18, BUSINESS_HOUR_UTC - 1), duration_min=180,
                status=AppointmentStatus.completed if done else AppointmentStatus.booked,
                created_by="admin",
            ))
            if finished:
                db.add(Payment(
                    case_id=case.id, kind=PaymentKind.balance, method=PaymentMethod.etransfer,
                    amount=980.00, status=PaymentStatus.received, received_at=days(offset + 19),
                    recorded_by=admin_id, note=f"{MOCK_NAME_PREFIX}final balance",
                ))

        db.add(CaseNote(
            case_id=case.id, admin_user_id=admin_id,
            content=f"{MOCK_NAME_PREFIX}internal note — demo data, delete with the purge script.",
            created_at=days(offset + 1),
        ))
        for ch, to in ((NotificationChannel.email, customer.email), (NotificationChannel.sms, customer.phone)):
            db.add(Notification(
                case_id=case.id, channel=ch, recipient=to, template_name="submission_confirm",
                subject=f"{MOCK_NAME_PREFIX}We received your request",
                content=f"{MOCK_NAME_PREFIX}demo notification body.",
                status=NotificationStatus.sent, sent_at=days(offset),
            ))
    print(f"  cases          {len(EV_CASES)}")


# (suffix, name, type, status, panels, address)
SERVICE_BOOKINGS = [
    ("01", "Nadia",  ServiceType.diagnostic,   ServiceBookingStatus.submitted,        16, "3 Bridlewood Ct SW"),
    ("02", "Omar",   ServiceType.diagnostic,   ServiceBookingStatus.scheduled,        24, "89 Arbour Lake Rd NW"),
    ("03", "Priya",  ServiceType.diagnostic,   ServiceBookingStatus.in_progress,      12, "215 Riverbend Dr SE"),
    ("04", "Quinn",  ServiceType.diagnostic,   ServiceBookingStatus.completed,        30, "7 Tuscany Ravine Rd NW"),
    ("05", "Rosa",   ServiceType.bird_netting, ServiceBookingStatus.submitted,        20, "44 Chaparral Valley Dr SE"),
    ("06", "Sami",   ServiceType.bird_netting, ServiceBookingStatus.survey_scheduled, 18, "150 Kincora Glen Rd NW"),
    ("07", "Tara",   ServiceType.bird_netting, ServiceBookingStatus.quoted,           26, "61 Skyview Ranch Rd NE"),
    ("08", "Ugo",    ServiceType.bird_netting, ServiceBookingStatus.approved,         22, "9 Aspen Stone Blvd SW"),
    ("09", "Vera",   ServiceType.bird_netting, ServiceBookingStatus.install_scheduled, 34, "78 Coventry Hills Way NE"),
    ("10", "Wes",    ServiceType.bird_netting, ServiceBookingStatus.completed,        28, "12 Douglasdale Blvd SE"),
    ("11", "Xenia",  ServiceType.diagnostic,   ServiceBookingStatus.cancelled,        14, "5 Hidden Valley Dr NW"),
]

QUOTED_STATES = {
    ServiceBookingStatus.quoted,
    ServiceBookingStatus.approved,
    ServiceBookingStatus.install_scheduled,
    ServiceBookingStatus.completed,
}
APPROVED_STATES = {
    ServiceBookingStatus.approved,
    ServiceBookingStatus.install_scheduled,
    ServiceBookingStatus.completed,
}


def seed_services(db: Session) -> None:
    for idx, (sfx, name, kind, status, panels, address) in enumerate(SERVICE_BOOKINGS):
        offset = -25 + idx * 2
        is_diag = kind is ServiceType.diagnostic
        scheduled = status in (
            ServiceBookingStatus.scheduled, ServiceBookingStatus.in_progress,
            ServiceBookingStatus.survey_scheduled, ServiceBookingStatus.install_scheduled,
            ServiceBookingStatus.completed,
        )
        booking = ServiceBooking(
            reference_number=f"{MOCK_REF_PREFIX}{'DG' if is_diag else 'BN'}-{sfx}",
            service_type=kind, status=status,
            customer_name=f"{MOCK_NAME_PREFIX}{name}",
            phone=f"+15551{200 + idx:04d}",
            email=f"mock+svc{sfx}@example.com",
            address=address, panel_count=panels,
            preferred_window="morning" if idx % 2 == 0 else "afternoon",
            inverter_info="Fronius Primo 5.0" if is_diag else None,
            problem_description=f"{MOCK_NAME_PREFIX}output dropped ~30% since June" if is_diag else None,
            problem_tags={"tags": ["low_output"]} if is_diag else None,
            photo_urls=[],
            technician="Mock-Tech A" if scheduled else None,
            scheduled_at=days(offset + 4) if scheduled else None,
            completed_at=days(offset + 5) if status is ServiceBookingStatus.completed else None,
            actual_hours=2.5 if (is_diag and status is ServiceBookingStatus.completed) else None,
            hardware_involved=status is ServiceBookingStatus.completed and is_diag,
            completion_notes=f"{MOCK_NAME_PREFIX}demo completion notes"
            if status is ServiceBookingStatus.completed else None,
            hourly_rate_snapshot=179.00 if is_diag else None,
            access_token=token(),
            disclaimer_accepted_at=days(offset),
            created_at=days(offset),
            updated_at=days(offset + 1),
            status_changed_at=days(-20) if sfx in ("01", "06", "07") else days(offset + 1),
        )
        db.add(booking)
        db.flush()

        if scheduled:
            appt_kind = (
                AppointmentKind.diagnostic if is_diag
                else AppointmentKind.bird_install
                if status in (ServiceBookingStatus.install_scheduled, ServiceBookingStatus.completed)
                else AppointmentKind.bird_survey
            )
            db.add(Appointment(
                service_booking_id=booking.id, kind=appt_kind,
                start_at=days(offset + 4, BUSINESS_HOUR_UTC + 1), duration_min=90,
                status=AppointmentStatus.completed
                if status is ServiceBookingStatus.completed else AppointmentStatus.booked,
                created_by="customer",
            ))

        if not is_diag and status in QUOTED_STATES:
            rolls, nests = 3, 2
            total = rolls * 599.00 + nests * 99.00
            db.add(BirdNettingQuote(
                booking_id=booking.id, roll_count=rolls, nest_count=nests,
                roll_price_snapshot=599.00, nest_fee_snapshot=99.00, total=total,
                status=QuoteStatus.approved if status in APPROVED_STATES else QuoteStatus.pending,
                signature_data=SIG_PNG if status in APPROVED_STATES else None,
                signed_name=f"{MOCK_NAME_PREFIX}{name}" if status in APPROVED_STATES else None,
                approved_at=days(offset + 6) if status in APPROVED_STATES else None,
            ))

        db.add(Notification(
            service_booking_id=booking.id, channel=NotificationChannel.email,
            recipient=booking.email, template_name="service_submitted",
            subject=f"{MOCK_NAME_PREFIX}Request received",
            content=f"{MOCK_NAME_PREFIX}demo notification body.",
            status=NotificationStatus.sent, sent_at=days(offset),
        ))
    print(f"  service bookings {len(SERVICE_BOOKINGS)}")


# (suffix, name, panels, tier, price, pricing, payment, address)
SUBSCRIPTIONS = [
    ("01", "Yara", 16, CleaningTier.tier1, 599.00, CleaningPricingStatus.quoted, CleaningPaymentStatus.paid, "22 Citadel Ridge Cl NW"),
    ("02", "Zane", 28, CleaningTier.tier2, 799.00, CleaningPricingStatus.quoted, CleaningPaymentStatus.unpaid, "310 Somerset Dr SW"),
    ("03", "Alma", 52, CleaningTier.custom, None, CleaningPricingStatus.pending_quote, CleaningPaymentStatus.unpaid, "4 Rocky Ridge View NW"),
]

VISIT_PLAN = [
    (CleaningVisitStatus.completed, -60),
    (CleaningVisitStatus.notified, None),  # None = the upcoming one, spread per subscription
    (CleaningVisitStatus.pending, 96),
    (CleaningVisitStatus.pending, 188),
]


def seed_cleaning(db: Session) -> None:
    for idx, (sfx, name, panels, tier, price, pricing, payment, address) in enumerate(SUBSCRIPTIONS):
        sub = CleaningSubscription(
            reference_number=f"{MOCK_REF_PREFIX}CL-{sfx}",
            customer_name=f"{MOCK_NAME_PREFIX}{name}",
            phone=f"+15552{300 + idx:04d}",
            email=f"mock+cl{sfx}@example.com",
            address=address, panel_count=panels, tier=tier, annual_price=price,
            pricing_status=pricing, payment_status=payment,
            start_date=(TODAY - timedelta(days=70)).date(),
            access_token=token(), disclaimer_accepted_at=days(-70),
            created_at=days(-70), updated_at=days(-70),
            status_changed_at=days(-70),
        )
        db.add(sub)
        db.flush()
        for q, (vstatus, day_offset) in enumerate(VISIT_PLAN, start=1):
            if day_offset is None:
                # the one upcoming visit — one per week, one per hour, so it can cost a real
                # customer at most a single slot in that hour (see CLEANING_NOTIFIED_OFFSET)
                day_offset = CLEANING_NOTIFIED_OFFSET + idx * CLEANING_NOTIFIED_STRIDE
            hour = BUSINESS_HOUR_UTC + idx
            # unpaid / unpriced subscriptions have not had any visit done yet
            effective = vstatus
            if payment is not CleaningPaymentStatus.paid and vstatus is CleaningVisitStatus.completed:
                effective = CleaningVisitStatus.pending
            visit = CleaningVisit(
                subscription_id=sub.id, quarter=q,
                scheduled_date=days(day_offset, hour) if effective is not CleaningVisitStatus.pending else None,
                status=effective,
                completed_at=days(day_offset, hour) if effective is CleaningVisitStatus.completed else None,
                notes=f"{MOCK_NAME_PREFIX}quarter {q} demo visit",
            )
            db.add(visit)
            db.flush()
            if effective in (CleaningVisitStatus.notified, CleaningVisitStatus.completed):
                db.add(Appointment(
                    cleaning_visit_id=visit.id, kind=AppointmentKind.cleaning,
                    start_at=days(day_offset, hour), duration_min=120,
                    status=AppointmentStatus.completed
                    if effective is CleaningVisitStatus.completed else AppointmentStatus.booked,
                    created_by="admin",
                ))
        db.add(Notification(
            cleaning_subscription_id=sub.id, channel=NotificationChannel.email,
            recipient=sub.email, template_name="cleaning_subscribed",
            subject=f"{MOCK_NAME_PREFIX}Subscription confirmed",
            content=f"{MOCK_NAME_PREFIX}demo notification body.",
            status=NotificationStatus.sent, sent_at=days(-70),
        ))
    print(f"  subscriptions    {len(SUBSCRIPTIONS)} (4 visits each)")


def seed(db: Session) -> None:
    purge(db)
    admin = db.execute(select(AdminUser)).scalars().first()
    admin_id = admin.id if admin else None
    print("seeding:")
    seed_ev(db, admin_id)
    seed_services(db)
    seed_cleaning(db)
    db.commit()
    print("done — every mock row is tagged MOCK-/Mock-; run `purge` to remove them all")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd not in ("seed", "purge"):
        raise SystemExit("usage: mock_data.py seed|purge")
    db = SessionLocal()
    try:
        (seed if cmd == "seed" else purge)(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
