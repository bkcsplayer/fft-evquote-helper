"""Tests for the global NOTIFY_REDIRECT (ADR-017) — no pytest.

Run: python -m tests.test_notify_redirect

SAFETY: the dev container holds REAL Twilio/SMTP credentials. Every test replaces
notification_service.send_sms / send_email (and case_extras.send_email for the resend endpoint)
with recorders, so nothing is ever dialled. Rows are flushed inside the record function's
SAVEPOINT and rolled back at the end of each test — nothing is committed.
Assertions are on the returned Notification object + the transport recorder (system boundary).
Settings are always patched with an explicit "on"/"off" so the tests never depend on the
container's own NOTIFY_REDIRECT.
"""

from __future__ import annotations

from contextlib import contextmanager

import app.api.v1.admin.case_extras as case_extras
import app.services.email_service as email_service
import app.services.notification_service as notif_svc
import app.services.sms_service as sms_service
from app.api.v1.admin.case_extras import NotificationResendIn, resend_notification_email
from app.config import Settings
from app.database import SessionLocal
from app.models.models import (
    Case, CaseStatus, Customer, Notification, NotificationChannel, NotificationStatus,
)
from app.utils.token import generate_access_token

KUO_SMS = "+15879669668"
KUO_EMAIL = "cool@khtain.com"
REAL_SMS = "+14035550123"
REAL_EMAIL = "real@example.com"


@contextmanager
def _mode(on: bool):
    """Patch settings (explicit on/off) and both transports with recorders; restore in finally."""
    orig = (notif_svc.get_settings, notif_svc.send_sms, notif_svc.send_email)
    rec = {"sms": [], "email": []}
    try:
        value = "on" if on else "off"
        notif_svc.get_settings = lambda: Settings(NOTIFY_REDIRECT=value)
        notif_svc.send_sms = lambda **kw: rec["sms"].append(kw)
        notif_svc.send_email = lambda **kw: rec["email"].append(kw)
        yield rec
    finally:
        notif_svc.get_settings, notif_svc.send_sms, notif_svc.send_email = orig


def _sms(db, to):
    return notif_svc._send_service_sms(
        db, to_phone=to, template_name="t", body="Hello",
        service_booking_id=None, cleaning_subscription_id=None,
    )


def _email(db, to, html="<p>x</p>"):
    return notif_svc._send_service_email(
        db, to_email=to, template_name="t", subject="Hi", html=html,
        service_booking_id=None, cleaning_subscription_id=None,
    )


def _mk_case(db) -> Case:
    customer = Customer(nickname="Mock-RedirectTest", phone="+15551230000", email="mock+redirect@example.com")
    db.add(customer)
    db.flush()
    case = Case(
        reference_number="TEST-REDIR",
        customer_id=customer.id,
        status=CaseStatus.quoted,
        charger_brand="Mock-Brand",
        ev_brand="Mock-EV",
        install_address="1 Mock St NW",
        preferred_survey_slots={},
        access_token=generate_access_token(),
    )
    db.add(case)
    db.flush()
    return case


def _assert_sms_redirected(n, rec):
    assert n.recipient == KUO_SMS
    assert n.content == f"[REDIRECTED — intended for {REAL_SMS}]\nHello"
    assert rec["sms"][-1]["to_phone"] == KUO_SMS
    assert rec["sms"][-1]["body"] == n.content


def _assert_email_redirected(n, rec):
    assert n.recipient == KUO_EMAIL
    assert n.subject == f"[REDIRECTED → {REAL_EMAIL}] Hi"
    assert n.content.endswith("<p>x</p>")
    assert f"Intended recipient: {REAL_EMAIL}" in n.content
    assert rec["email"][-1]["to_email"] == KUO_EMAIL


def test_1_service_sms_on():
    db = SessionLocal()
    try:
        with _mode(True) as rec:
            n = _sms(db, REAL_SMS)
        _assert_sms_redirected(n, rec)
    finally:
        db.rollback()
        db.close()


def test_2_service_email_on():
    db = SessionLocal()
    try:
        with _mode(True) as rec:
            n = _email(db, REAL_EMAIL)
        _assert_email_redirected(n, rec)
    finally:
        db.rollback()
        db.close()


def test_3_off_is_untouched():
    db = SessionLocal()
    try:
        with _mode(False) as rec:
            s = _sms(db, REAL_SMS)
            e = _email(db, REAL_EMAIL)
        assert s.recipient == REAL_SMS and s.content == "Hello"
        assert e.recipient == REAL_EMAIL and e.subject == "Hi" and e.content == "<p>x</p>"
        assert "REDIRECTED" not in s.content + e.content + e.subject
        assert rec["sms"][-1]["to_phone"] == REAL_SMS
        assert rec["email"][-1]["to_email"] == REAL_EMAIL
    finally:
        db.rollback()
        db.close()


def test_4_on_but_already_target_is_noop():
    db = SessionLocal()
    try:
        with _mode(True) as rec:
            s = _sms(db, KUO_SMS)
            e1 = _email(db, KUO_EMAIL)
            e2 = _email(db, "  COOL@Khtain.com ")
        assert s.content == "Hello"
        for e in (e1, e2):
            assert e.subject == "Hi" and e.content == "<p>x</p>"
        assert len(rec["sms"]) == 1 and len(rec["email"]) == 2
    finally:
        db.rollback()
        db.close()


def test_5_ev_pair_on():
    db = SessionLocal()
    try:
        case = _mk_case(db)
        with _mode(True) as rec:
            s = notif_svc.notify_sms(db, case_id=str(case.id), to_phone=REAL_SMS, template_name="t", body="Hello")
            e = notif_svc.notify_email(
                db, case_id=str(case.id), to_email=REAL_EMAIL, template_name="t", subject="Hi", html="<p>x</p>",
            )
        _assert_sms_redirected(s, rec)
        _assert_email_redirected(e, rec)
    finally:
        db.rollback()
        db.close()


def test_6_resend_endpoint():
    db = SessionLocal()
    orig_send = case_extras.send_email
    try:
        case = _mk_case(db)
        n = Notification(
            case_id=case.id, channel=NotificationChannel.email, recipient=REAL_EMAIL,
            template_name="t", subject="Hi", content="<p>x</p>", status=NotificationStatus.sent,
        )
        db.add(n)
        db.flush()
        sent = []
        case_extras.send_email = lambda **kw: sent.append(kw)

        with _mode(True):
            out = resend_notification_email(str(n.id), NotificationResendIn(to_email=None), db, None)
        assert sent[-1]["to_email"] == KUO_EMAIL
        assert sent[-1]["subject"].startswith("[REDIRECTED")
        assert out == {"ok": True, "to": KUO_EMAIL}

        with _mode(False):
            resend_notification_email(str(n.id), NotificationResendIn(to_email=None), db, None)
        assert sent[-1]["to_email"] == REAL_EMAIL
    finally:
        case_extras.send_email = orig_send
        db.rollback()
        db.close()


def test_7_enabled_semantics():
    orig = notif_svc.get_settings
    try:
        for value, expected in (
            ("on", True), ("ON", True), (" On ", True),
            ("off", False), ("", False), ("true", False), ("1", False),
        ):
            notif_svc.get_settings = lambda v=value: Settings(NOTIFY_REDIRECT=v)
            assert notif_svc.notify_redirect_enabled() is expected, value
    finally:
        notif_svc.get_settings = orig


def test_8_inline_logo_html_still_sends():
    db = SessionLocal()
    try:
        with _mode(True) as rec:
            n = _email(db, REAL_EMAIL, html='<img src="cid:brand-logo"><p>x</p>')
        assert n is not None and n.recipient == KUO_EMAIL
        assert "cid:brand-logo" in n.content
        assert len(rec["email"]) == 1
    finally:
        db.rollback()
        db.close()


@contextmanager
def _transport_on():
    """ADR-020: patch both transport modules' settings to NOTIFY_REDIRECT=on with SMTP/Twilio blanked,
    so a call that passes the guard stops at the "not configured" error — nothing is ever dialled."""
    orig = (email_service.get_settings, sms_service.get_settings)
    try:
        s = Settings(NOTIFY_REDIRECT="on", SMTP_HOST="", SMTP_PORT="", TWILIO_ACCOUNT_SID="")
        email_service.get_settings = lambda: s
        sms_service.get_settings = lambda: s
        yield
    finally:
        email_service.get_settings, sms_service.get_settings = orig


def _raises(fn) -> str:
    try:
        fn()
    except RuntimeError as e:
        return str(e)
    raise AssertionError("expected RuntimeError")


def test_9_transport_guard_refuses_non_target():
    with _transport_on():
        for to in (REAL_EMAIL, "cool@khtain.com.evil.example"):
            msg = _raises(lambda: email_service.send_email(to_email=to, subject="Hi", html="<p>x</p>"))
            assert "NOTIFY_REDIRECT" in msg, msg
        msg = _raises(lambda: sms_service.send_sms(to_phone=REAL_SMS, body="Hello"))
        assert "NOTIFY_REDIRECT" in msg, msg


def test_10_transport_guard_passes_target():
    with _transport_on():
        for to in (KUO_EMAIL, "  COOL@Khtain.com "):
            msg = _raises(lambda: email_service.send_email(to_email=to, subject="Hi", html="<p>x</p>"))
            assert msg == "SMTP not configured", msg
        msg = _raises(lambda: sms_service.send_sms(to_phone=KUO_SMS, body="Hello"))
        assert msg == "Twilio not configured", msg


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} notify-redirect tests passed.")
