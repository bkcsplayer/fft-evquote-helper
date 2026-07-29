"""Unit/integration tests for nudge_service.py — DB via SessionLocal, no pytest.

Run:
    docker exec -w /app fft-evquote-helper-backend-1 python tests/test_nudge_service.py

SAFETY: the dev backend container has REAL Twilio/SMTP credentials configured, and the nudge
redirect target (+15879669668 / cool@khtain.com) is Kuo's own real phone/email — sending for
real on every test run is not acceptable. Every test that calls run_daily_nudges() therefore
stubs app.services.notification_service.send_sms / send_email (the module-level names those
functions are bound to, not app.services.sms_service.send_sms — same lesson as the get_settings
patch below) for the duration of the call, so notifications are recorded as "sent" without any
real network dispatch. Each orchestrator-calling test uses the real current time as `now` (the
per-target/per-day idempotency checks in nudge_service compare against real DB `created_at`
timestamps, which are always real wall-clock time regardless of what `now` is passed in — so a
fictional past `now` would silently break the "call twice, second call is a no-op" checks).
Assertions are scoped to each test's own freshly-created row (by FK). NOTE: as of the round-2
review fix, run_daily_nudges() excludes any target whose reference_number starts with "MOCK-" at
its single choke point (see nudge_service.py) — so test rows that exercise the real send/digest
path use `_ref()`, which deliberately does NOT start with "MOCK-" (it uses "TESTNUDGE-"), while
still carrying the project's `Mock-` content marker on customer_name/email so a stray leaked row
is still eyeball-obvious in the DB. `_mock_ref()` (which DOES start with "MOCK-") exists
separately, only for the exclusion test that verifies the choke point itself. The one table-wide
check (digest) does its own defensive before/after cleanup.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select, func

from app.database import SessionLocal
from app.models.models import (
    Case, CaseNote, CaseStatus, CaseStatusHistory, CleaningPaymentStatus,
    CleaningPricingStatus, CleaningSubscription, CleaningTier, Customer, Notification,
    NotificationChannel, NotificationStatus, ServiceBooking, ServiceBookingStatus, ServiceType,
)
from app.utils.token import generate_access_token

import app.services.nudge_service as ns
from app.config import Settings
from app.services.nudge_service import (
    _CLEANING_CLASSIFY, _EV_CLASSIFY, _SERVICE_CLASSIFY, should_nudge,
)
from app.services.service_booking_flow import DIAGNOSTIC_TRANSITIONS, BIRD_TRANSITIONS
import app.services.notification_service as notif_svc


def _ref(prefix: str) -> str:
    # Deliberately NOT "MOCK-" — run_daily_nudges excludes that prefix at its choke point, and
    # these rows need to actually flow through the real send/digest path to be tested. reference_
    # number is String(20), so keep prefix short: "TEST-" + prefix + "-" + 8 hex chars <= 20.
    return f"TEST-{prefix}-{uuid.uuid4().hex[:8].upper()}"[:20]


def _mock_ref(prefix: str) -> str:
    # DOES start with "MOCK-" — used only by the exclusion test itself.
    return f"MOCK-{prefix}-{uuid.uuid4().hex[:8].upper()}"[:20]


class _stub_transport:
    """No-op send_sms/send_email so orchestrator tests never dial Twilio/SMTP for real."""

    def __enter__(self):
        self._orig_sms = notif_svc.send_sms
        self._orig_email = notif_svc.send_email
        notif_svc.send_sms = lambda **kw: None
        notif_svc.send_email = lambda **kw: None
        return self

    def __exit__(self, *exc):
        notif_svc.send_sms = self._orig_sms
        notif_svc.send_email = self._orig_email
        return False


def _mk_ev_case(db, *, status: CaseStatus, clock: datetime, phone: str = "+15551230000", ref: str | None = None) -> Case:
    customer = Customer(nickname="Mock-NudgeTest", phone=phone, email="mock+nudge@example.com")
    db.add(customer)
    db.flush()
    case = Case(
        reference_number=ref or _ref("EV"),
        customer_id=customer.id,
        status=status,
        charger_brand="Mock-Brand",
        ev_brand="Mock-EV",
        install_address="1 Mock St NW",
        preferred_survey_slots={},
        access_token=generate_access_token(),
    )
    db.add(case)
    db.flush()
    db.add(CaseStatusHistory(case_id=case.id, from_status=None, to_status=status.value, created_at=clock))
    db.commit()
    db.refresh(case)
    return case


def _cleanup_case(db, case: Case) -> None:
    db.query(Notification).filter(Notification.case_id == case.id).delete(synchronize_session=False)
    db.query(CaseNote).filter(CaseNote.case_id == case.id).delete(synchronize_session=False)
    db.query(CaseStatusHistory).filter(CaseStatusHistory.case_id == case.id).delete(synchronize_session=False)
    customer_id = case.customer_id
    db.delete(case)
    db.flush()
    db.query(Customer).filter(Customer.id == customer_id).delete(synchronize_session=False)
    db.commit()


def _mk_service_booking(db, *, service_type: ServiceType, status: ServiceBookingStatus, clock: datetime) -> ServiceBooking:
    booking = ServiceBooking(
        reference_number=_ref("SVC"),
        service_type=service_type,
        status=status,
        customer_name="Mock-NudgeTest",
        phone="+15551230001",
        email="mock+nudgesvc@example.com",
        address="2 Mock St NW",
        panel_count=10,
        access_token=generate_access_token(),
        disclaimer_accepted_at=clock,
        status_changed_at=clock,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def _cleanup_service_booking(db, booking: ServiceBooking) -> None:
    db.query(Notification).filter(Notification.service_booking_id == booking.id).delete(synchronize_session=False)
    db.delete(booking)
    db.commit()


def _mk_cleaning_sub(db, *, pricing_status: CleaningPricingStatus, payment_status: CleaningPaymentStatus, clock: datetime) -> CleaningSubscription:
    sub = CleaningSubscription(
        reference_number=_ref("CLN"),
        customer_name="Mock-NudgeTest",
        phone="+15551230002",
        email="mock+nudgecln@example.com",
        address="3 Mock St NW",
        panel_count=10,
        tier=CleaningTier.tier1,
        annual_price=599.00,
        pricing_status=pricing_status,
        payment_status=payment_status,
        start_date=date(2026, 1, 1),
        access_token=generate_access_token(),
        disclaimer_accepted_at=clock,
        status_changed_at=clock,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _cleanup_cleaning_sub(db, sub: CleaningSubscription) -> None:
    db.query(Notification).filter(Notification.cleaning_subscription_id == sub.id).delete(synchronize_session=False)
    db.delete(sub)
    db.commit()


def _digest_count(db, now: datetime) -> int:
    start, end = ns._calgary_day_bounds_utc(now)
    return db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.template_name == ns.NUDGE_DIGEST_TEMPLATE,
            Notification.created_at >= start, Notification.created_at < end,
        )
    ).scalar_one()


def _cleanup_digest(db, now: datetime) -> None:
    start, end = ns._calgary_day_bounds_utc(now)
    db.query(Notification).filter(
        Notification.template_name == ns.NUDGE_DIGEST_TEMPLATE,
        Notification.created_at >= start, Notification.created_at < end,
    ).delete(synchronize_session=False)
    db.commit()


# ── 1. exhaustiveness ──
def test_ev_classify_exhaustive():
    assert set(_EV_CLASSIFY) == set(CaseStatus)


def test_service_classify_exhaustive():
    # Sentinel 1: a newly-added ServiceType would silently fall through
    # _SERVICE_CLASSIFY.get(key, "none") in nudge_service — nothing here would ever fail loudly.
    # If this assertion breaks, wire the new type into transitions + _SERVICE_CLASSIFY, then update.
    assert set(ServiceType) == {ServiceType.diagnostic, ServiceType.bird_netting}, \
        "new ServiceType: wire transitions + _SERVICE_CLASSIFY rows, then update this test"

    diagnostic_keys = {ServiceBookingStatus.submitted} | set(DIAGNOSTIC_TRANSITIONS) | {
        s for vs in DIAGNOSTIC_TRANSITIONS.values() for s in vs
    }
    bird_keys = {ServiceBookingStatus.submitted} | set(BIRD_TRANSITIONS) | {
        s for vs in BIRD_TRANSITIONS.values() for s in vs
    }
    # Sentinel 2: a ServiceBookingStatus member unreachable from any transitions table would be
    # silently absent from `expected` below, so the exhaustiveness check would never catch it.
    assert diagnostic_keys | bird_keys == set(ServiceBookingStatus), \
        "ServiceBookingStatus member not reachable in any transitions table"

    expected = {(ServiceType.diagnostic, s) for s in diagnostic_keys} | {
        (ServiceType.bird_netting, s) for s in bird_keys
    }
    for key in expected:
        assert key in _SERVICE_CLASSIFY, f"missing {key}"
    assert set(_SERVICE_CLASSIFY) == expected


def test_cleaning_classify_exhaustive():
    assert set(_CLEANING_CLASSIFY) == {
        (p, m) for p in CleaningPricingStatus for m in CleaningPaymentStatus
    }


def test_should_nudge_boundaries():
    f = should_nudge
    assert (f(13, 0), f(14, 0), f(27, 1), f(28, 1), f(42, 2), f(56, 3)) == (
        False, True, False, True, True, False,
    )


def test_redirect_default_on_and_off():
    # NOTE: Settings.nudge_redirect has validation_alias="NUDGE_REDIRECT" and the model has no
    # populate_by_name=True, so Settings(nudge_redirect=...) is silently ignored (extra="ignore")
    # — must construct via the alias NUDGE_REDIRECT= instead.
    original = ns.get_settings
    try:
        ns.get_settings = lambda: Settings(NUDGE_REDIRECT=None)
        assert ns.redirect_enabled() is True
        ns.get_settings = lambda: Settings(NUDGE_REDIRECT="off")
        assert ns.redirect_enabled() is False
        ns.get_settings = lambda: Settings(NUDGE_REDIRECT="FALSE")
        assert ns.redirect_enabled() is True  # not exactly "off", still redirects
    finally:
        ns.get_settings = original


# ── 2. run_daily_nudges — each test uses its own isolated `now` (early 2026, well before any
# seeded mock data's stalled clock) so it never entangles with real MOCK- rows or other tests. ──
def test_run_daily_nudges_ev_quoted_sends_redirected():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    case = _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=20))
    try:
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows = db.execute(
            select(Notification).where(
                Notification.case_id == case.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].recipient == "+15879669668"
        assert rows[0].content.startswith("[→ ")

        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows2 = db.execute(
            select(Notification).where(
                Notification.case_id == case.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows2) == 1  # same-day idempotent, no second send
    finally:
        _cleanup_digest(db, now)
        _cleanup_case(db, case)
        db.close()


def test_run_daily_nudges_needs_followup_writes_case_note_once():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    clock = now - timedelta(days=50)
    case = _mk_ev_case(db, status=CaseStatus.quoted, clock=clock)
    try:
        for i in range(3):
            # created_at explicitly NOT today, else _already_attempted_today would (correctly)
            # treat these as "already tried today" and skip before ever reaching the cap check.
            past_day = now - timedelta(days=5 + i)
            db.add(Notification(
                case_id=case.id, channel=NotificationChannel.sms,
                recipient="+15879669668", template_name="nudge_customer", subject=None,
                content="prior nudge", status=NotificationStatus.sent,
                sent_at=past_day, created_at=past_day,
            ))
        db.commit()

        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows = db.execute(
            select(Notification).where(
                Notification.case_id == case.id, Notification.template_name == "nudge_customer",
                Notification.content == "prior nudge",
            )
        ).scalars().all()
        assert len(rows) == 3  # no 4th nudge added

        notes = db.execute(select(CaseNote).where(CaseNote.case_id == case.id, CaseNote.content.like("NUDGE:%"))).scalars().all()
        assert len(notes) == 1

        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        notes2 = db.execute(select(CaseNote).where(CaseNote.case_id == case.id, CaseNote.content.like("NUDGE:%"))).scalars().all()
        assert len(notes2) == 1  # not duplicated
    finally:
        _cleanup_digest(db, now)
        _cleanup_case(db, case)
        db.close()


def test_run_daily_nudges_service_booking_customer_side():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    booking = _mk_service_booking(
        db, service_type=ServiceType.bird_netting, status=ServiceBookingStatus.quoted,
        clock=now - timedelta(days=20),
    )
    try:
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows = db.execute(
            select(Notification).where(
                Notification.service_booking_id == booking.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows) == 1
        assert "/service/bird-netting/quote/" in rows[0].content
    finally:
        _cleanup_digest(db, now)
        _cleanup_service_booking(db, booking)
        db.close()


def test_run_daily_nudges_cleaning_customer_side():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    sub = _mk_cleaning_sub(
        db, pricing_status=CleaningPricingStatus.quoted, payment_status=CleaningPaymentStatus.unpaid,
        clock=now - timedelta(days=20),
    )
    try:
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows = db.execute(
            select(Notification).where(
                Notification.cleaning_subscription_id == sub.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows) == 1
    finally:
        _cleanup_digest(db, now)
        _cleanup_cleaning_sub(db, sub)
        db.close()


def test_digest_is_one_row_per_day():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    _cleanup_digest(db, now)  # defensive: guarantee a clean slate for today regardless of stray state
    ours_case = _mk_ev_case(db, status=CaseStatus.quoting, clock=now - timedelta(days=20))
    customer_case = _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=20))
    try:
        before = _digest_count(db, now)
        assert before == 0
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        after_first = _digest_count(db, now)
        assert after_first == 1
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        after_second = _digest_count(db, now)
        assert after_second == 1
    finally:
        _cleanup_digest(db, now)
        _cleanup_case(db, ours_case)
        _cleanup_case(db, customer_case)
        db.close()


def _scope_scans_to(db, cases: list[Case]):
    """Monkeypatch the three module-level scan functions so run_daily_nudges only ever sees the
    given EV cases — isolates a test's assertions from whatever real (non-MOCK-) stalled data
    already exists in the shared dev DB. Returns a restore callable."""
    orig_scan_ev, orig_scan_services, orig_scan_cleaning = ns._scan_ev, ns._scan_services, ns._scan_cleaning
    wanted_ids = {str(c.id) for c in cases}

    def _scoped_scan_ev(db_, now_):
        return [t for t in orig_scan_ev(db_, now_) if t.id in wanted_ids]

    ns._scan_ev = _scoped_scan_ev
    ns._scan_services = lambda db_, now_: []
    ns._scan_cleaning = lambda db_, now_: []

    def _restore():
        ns._scan_ev, ns._scan_services, ns._scan_cleaning = orig_scan_ev, orig_scan_services, orig_scan_cleaning

    return _restore


def test_mock_prefix_excluded_everywhere():
    # MOCK- prefixed reference numbers (the project-wide mock-data marker, see mock_data.py) must
    # never be nudged by SMS and must never appear in any of the three digest sections
    # (nudged / our_side / needs_followup) — see nudge_service.run_daily_nudges choke-point filter.
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    _cleanup_digest(db, now)
    real_ours_case = _mk_ev_case(db, status=CaseStatus.quoting, clock=now - timedelta(days=20))
    mock_customer_case = _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=20), ref=_mock_ref("EV"))
    mock_ours_case = _mk_ev_case(db, status=CaseStatus.quoting, clock=now - timedelta(days=20), ref=_mock_ref("EV"))
    mock_cap_case = _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=50), ref=_mock_ref("EV"))
    for i in range(3):
        past_day = now - timedelta(days=5 + i)
        db.add(Notification(
            case_id=mock_cap_case.id, channel=NotificationChannel.sms,
            recipient="+15879669668", template_name="nudge_customer", subject=None,
            content="prior nudge", status=NotificationStatus.sent,
            sent_at=past_day, created_at=past_day,
        ))
    db.commit()
    restore = _scope_scans_to(db, [real_ours_case, mock_customer_case, mock_ours_case, mock_cap_case])
    try:
        with _stub_transport():
            result = ns.run_daily_nudges(db, now=now)

        assert result["digest_sent"] is True
        assert result["needs_followup"] == 0  # mock_cap_case must NOT count — filtered before the cap check

        no_prior_ids = [mock_customer_case.id, mock_ours_case.id]
        mock_nudge_rows = db.execute(
            select(Notification).where(
                Notification.case_id.in_(no_prior_ids), Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert mock_nudge_rows == []  # no SMS sent for either mock target

        # mock_cap_case has 3 pre-seeded "prior nudge" rows from setup above (simulating an
        # already-at-cap target); assert the count stayed at 3 — i.e. no 4th row got added, which
        # is what would have happened (needs_followup path) if the MOCK- filter didn't exclude it
        # before the cap check ever runs.
        mock_cap_rows = db.execute(
            select(Notification).where(
                Notification.case_id == mock_cap_case.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(mock_cap_rows) == 3

        mock_notes = db.execute(
            select(CaseNote).where(CaseNote.case_id == mock_cap_case.id, CaseNote.content.like("NUDGE:%"))
        ).scalars().all()
        assert mock_notes == []

        start, end = ns._calgary_day_bounds_utc(now)
        digest_rows = db.execute(
            select(Notification).where(
                Notification.template_name == ns.NUDGE_DIGEST_TEMPLATE,
                Notification.created_at >= start, Notification.created_at < end,
            )
        ).scalars().all()
        assert len(digest_rows) == 1
        digest_html = digest_rows[0].content
        assert mock_customer_case.reference_number not in digest_html
        assert mock_ours_case.reference_number not in digest_html
        assert mock_cap_case.reference_number not in digest_html
        assert real_ours_case.reference_number in digest_html  # sanity: real "ours" targets DO appear
    finally:
        restore()
        _cleanup_digest(db, now)
        _cleanup_case(db, real_ours_case)
        _cleanup_case(db, mock_customer_case)
        _cleanup_case(db, mock_ours_case)
        _cleanup_case(db, mock_cap_case)
        db.close()


def test_flood_cap_limits_sends_and_flags_flood_capped():
    # NUDGE_MAX_PER_RUN caps total customer sends per run; targets held back by the flood gate get
    # NO Notification row (idempotency-preserving — same-day rerun or tomorrow's cron picks them
    # right back up).
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    n_targets = 4
    cases = [
        _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=20))
        for _ in range(n_targets)
    ]
    restore = _scope_scans_to(db, cases)
    orig_max = ns.NUDGE_MAX_PER_RUN
    try:
        ns.NUDGE_MAX_PER_RUN = 2
        with _stub_transport():
            result = ns.run_daily_nudges(db, now=now)

        assert result["flood_capped"] == n_targets - 2
        assert result["customer_nudges_sent"] + result["customer_nudges_failed"] == 2

        rows = db.execute(
            select(Notification).where(
                Notification.case_id.in_([c.id for c in cases]), Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows) == 2  # exactly the un-capped targets got a Notification row; the other 2 got none
    finally:
        ns.NUDGE_MAX_PER_RUN = orig_max
        restore()
        _cleanup_digest(db, now)
        for c in cases:
            _cleanup_case(db, c)
        db.close()


def test_redirect_recipient_never_real_contact():
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    real_phone = "+15550009999"
    case = _mk_ev_case(db, status=CaseStatus.quoted, clock=now - timedelta(days=20), phone=real_phone)
    try:
        with _stub_transport():
            ns.run_daily_nudges(db, now=now)
        rows = db.execute(
            select(Notification).where(
                Notification.case_id == case.id, Notification.template_name == "nudge_customer",
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].recipient == "+15879669668"
        assert rows[0].recipient != real_phone
    finally:
        _cleanup_digest(db, now)
        _cleanup_case(db, case)
        db.close()


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} nudge-service tests passed.")
