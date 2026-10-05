"""v3.0 four-service portal tests.

Pure unit tests (no DB / no stack) for cleaning tier resolution, plus integration tests (live
stack, same httpx style as test_e2e_flow.py) for: shared capacity pool, diagnostic booking,
bird-netting quote+approval, and cleaning subscription+visit flow.

The integration tests require a running backend at head (with the v3 migration applied) and an
admin login (ADMIN_USERNAME/ADMIN_PASSWORD, default admin/admin1234 in development).
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import httpx
import pytest


# ── pure unit: tier resolution ──
def test_cleaning_tier_resolution():
    # The `tests` image (Dockerfile.test) has no `app` package; a top-level app import would abort
    # collection of this whole file there, so import lazily and skip when it is unavailable.
    pytest.importorskip("app.services.service_pricing")
    from app.models.models import CleaningTier
    from app.services.service_pricing import DEFAULT_SERVICE_PRICING, resolve_cleaning_tier

    p = DEFAULT_SERVICE_PRICING
    assert resolve_cleaning_tier(p, 10) == (CleaningTier.tier1, 599.0)
    assert resolve_cleaning_tier(p, 20) == (CleaningTier.tier1, 599.0)
    assert resolve_cleaning_tier(p, 21) == (CleaningTier.tier2, 799.0)
    assert resolve_cleaning_tier(p, 35) == (CleaningTier.tier2, 799.0)
    tier, price = resolve_cleaning_tier(p, 36)
    assert tier == CleaningTier.custom and price is None
    tier, price = resolve_cleaning_tier(p, 80)
    assert tier == CleaningTier.custom and price is None


# ── integration helpers ──
def _api_base() -> str:
    return os.environ.get("API_BASE", "http://backend:8000").rstrip("/")


def _url(path: str) -> str:
    return f"{_api_base()}{path}"


def _stack_up() -> bool:
    try:
        return httpx.get(_url("/health"), timeout=5).status_code == 200
    except Exception:
        return False


def _admin_headers() -> dict[str, str]:
    login = httpx.post(
        _url("/api/v1/admin/auth/login"),
        json={
            "username": os.environ.get("ADMIN_USERNAME", "admin"),
            "password": os.environ.get("ADMIN_PASSWORD", "admin1234"),
        },
        timeout=15,
    )
    assert login.status_code == 200, login.text
    return {"authorization": f"Bearer {login.json()['access_token']}"}


def _first_slot() -> str | None:
    r = httpx.get(_url("/api/v1/public/services/slots"), timeout=15)
    assert r.status_code == 200
    slots = r.json().get("slots") or []
    return slots[0] if slots else None


needs_stack = pytest.mark.skipif(not _stack_up(), reason="live backend stack not reachable")


@needs_stack
def test_service_pricing_exposed():
    r = httpx.get(_url("/api/v1/public/service-pricing"), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["diagnostic_hourly_rate"] == 179.0
    assert body["bird_netting_roll_price"] == 599.0
    assert body["bird_netting_nest_fee"] == 99.0


@needs_stack
def test_diagnostic_requires_disclaimer():
    slot = _first_slot()
    if not slot:
        pytest.skip("no available slots in booking window")
    r = httpx.post(
        _url("/api/v1/public/services/bookings"),
        json={
            "service_type": "diagnostic",
            "customer_name": "No Consent",
            "phone": "+14035550111",
            "email": "noconsent@example.com",
            "address": "1 Test Ave, Calgary, AB",
            "panel_count": 12,
            "start_at": slot,
            "disclaimer_accepted": False,
            "problem_description": "not producing",
        },
        timeout=20,
    )
    assert r.status_code == 400


@needs_stack
def test_diagnostic_booking_consumes_shared_pool():
    slot = _first_slot()
    if not slot:
        pytest.skip("no available slots in booking window")

    # Book a diagnostic at the first shared-pool slot.
    r = httpx.post(
        _url("/api/v1/public/services/bookings"),
        json={
            "service_type": "diagnostic",
            "customer_name": "Diag Tester",
            "phone": "+14035550112",
            "email": "diag@example.com",
            "address": "2 Test Ave, Calgary, AB",
            "panel_count": 16,
            "start_at": slot,
            "disclaimer_accepted": True,
            "inverter_info": "SolarEdge SE5000",
            "problem_description": "monitoring offline",
            "problem_tags": ["monitor_offline"],
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]

    # Shared pool (default capacity 1): the slot is gone from services availability.
    r2 = httpx.get(_url("/api/v1/public/services/slots"), timeout=15)
    assert slot not in (r2.json().get("slots") or [])

    # Status page reflects the booking.
    st = httpx.get(_url(f"/api/v1/public/services/bookings/{token}"), timeout=15)
    assert st.status_code == 200
    assert st.json()["service_type"] == "diagnostic"
    assert st.json()["scheduled_at"] is not None


@needs_stack
def test_cleaning_subscription_and_visit_flow():
    headers = _admin_headers()

    # Submit a tier2 subscription (21..35 panels).
    r = httpx.post(
        _url("/api/v1/public/services/cleaning/subscriptions"),
        json={
            "customer_name": "Clean Tester",
            "phone": "+14035550114",
            "email": "clean@example.com",
            "address": "4 Test Ave, Calgary, AB",
            "panel_count": 30,
            "disclaimer_accepted": True,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tier"] == "tier2"
    assert body["annual_price"] == 799.0
    assert body["pricing_status"] == "quoted"
    token = body["token"]

    # Public status: 4 pending visits created.
    st = httpx.get(_url(f"/api/v1/public/services/cleaning/{token}"), timeout=15)
    assert st.status_code == 200
    visits = st.json()["visits"]
    assert len(visits) == 4
    assert all(v["status"] == "pending" for v in visits)

    # Admin: find subscription + schedule its first visit at the next shared-pool slot.
    lst = httpx.get(_url("/api/v1/admin/services/cleaning"), headers=headers, timeout=20)
    sub = next(s for s in lst.json() if s["access_token"] == token)
    visit_id = sub["visits"][0]["id"]

    slot = _first_slot()
    if not slot:
        pytest.skip("no available slots in booking window")
    sch = httpx.post(
        _url(f"/api/v1/admin/services/cleaning/visits/{visit_id}/schedule"),
        headers=headers,
        json={"start_at": slot},
        timeout=20,
    )
    assert sch.status_code == 200, sch.text
    q1 = next(v for v in sch.json()["visits"] if v["id"] == visit_id)
    assert q1["status"] == "notified"
    assert q1["scheduled_date"] is not None

    # Mark completed.
    done = httpx.post(
        _url(f"/api/v1/admin/services/cleaning/visits/{visit_id}/status"),
        headers=headers,
        json={"status": "completed", "notes": "ok"},
        timeout=20,
    )
    assert done.status_code == 200
    q1b = next(v for v in done.json()["visits"] if v["id"] == visit_id)
    assert q1b["status"] == "completed"


@needs_stack
def test_cleaning_custom_tier_pending_quote():
    r = httpx.post(
        _url("/api/v1/public/services/cleaning/subscriptions"),
        json={
            "customer_name": "Big Roof",
            "phone": "+14035550115",
            "email": "bigroof@example.com",
            "address": "5 Test Ave, Calgary, AB",
            "panel_count": 48,
            "disclaimer_accepted": True,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tier"] == "custom"
    assert body["annual_price"] is None
    assert body["pricing_status"] == "pending_quote"


@needs_stack
def test_services_dashboard_new_fields():
    # Regression + shape check for the Dashboard v3 service-block fields added to
    # GET /admin/services/dashboard (additive only — existing keys must be unchanged).
    headers = _admin_headers()
    r = httpx.get(_url("/api/v1/admin/services/dashboard"), headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()

    assert set(body["combined"]) >= {"new_bookings_this_month", "active_cleaning_subscriptions", "pending_bird_quotes"}
    diag = body["per_service"]["diagnostic"]
    bird = body["per_service"]["bird_netting"]
    clean = body["per_service"]["cleaning"]
    assert set(diag) >= {"count_this_month", "revenue_this_month", "status_counts"}
    assert set(bird) >= {"count_this_month", "revenue_this_month", "status_counts"}
    assert set(clean) >= {"count_this_month", "revenue_this_month", "pricing_status_counts", "visit_status_counts"}

    assert "next_scheduled_at" in diag
    assert isinstance(diag["scheduled_next_7_days"], int)
    assert diag["avg_hours_completed"] is None or isinstance(diag["avg_hours_completed"], (int, float))
    assert isinstance(bird["outstanding_quote_value"], (int, float))
    assert isinstance(bird["surveys_next_7_days"], int)
    assert isinstance(clean["payment_status_counts"], dict)
    assert isinstance(clean["unpaid_value"], (int, float))
    assert isinstance(clean["visits_next_7_days"], int)
    assert isinstance(clean["expiring_within_60_days"], int)

    assert clean["payment_status_counts"].get("unpaid", 0) >= 1
    assert clean["unpaid_value"] >= 0


@needs_stack
def test_unified_schedule_aggregates_services():
    headers = _admin_headers()
    r = httpx.get(_url("/api/v1/admin/services/schedule"), headers=headers, timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # Every item carries a service classification derived from its appointment kind.
    for it in items:
        assert it["service"] in {"ev", "diagnostic", "bird_netting", "cleaning", "other"}
        assert "pending" in it


@needs_stack
def test_unified_schedule_includes_pending_ev_survey_request():
    # An EV survey time the customer requested but admin hasn't confirmed yet has no
    # Appointment row — it must still show up (read-only, pending=True) so the calendar
    # surfaces work that needs action, not just confirmed slots.
    brands = httpx.get(_url("/api/v1/charger-brands"), timeout=15)
    assert brands.status_code == 200 and brands.json()
    submitted = httpx.post(
        _url("/api/v1/cases"),
        json={
            "customer": {"nickname": "PendingReq", "phone": "+14035550188", "email": "pendingreq@example.com"},
            "charger_brand": brands.json()[0]["name"],
            "ev_brand": "Tesla",
            "install_address": "1 Pending Ave, Calgary, AB",
            "preferred_survey_slots": {"slots": ["morning"]},
        },
        timeout=20,
    )
    assert submitted.status_code == 200, submitted.text
    token = submitted.json()["access_token"]
    ref = submitted.json()["reference_number"]

    requested_at = (datetime.now(timezone.utc) + timedelta(days=3)).replace(microsecond=0)
    req = httpx.post(
        _url(f"/api/v1/cases/survey/request/{token}"),
        json={"requested_date": requested_at.isoformat(), "note": ""},
        timeout=20,
    )
    assert req.status_code == 200, req.text

    headers = _admin_headers()
    sched = httpx.get(
        _url("/api/v1/admin/services/schedule"),
        params={"from": (requested_at - timedelta(days=1)).isoformat(), "to": (requested_at + timedelta(days=1)).isoformat()},
        headers=headers,
        timeout=20,
    )
    assert sched.status_code == 200
    match = next((it for it in sched.json() if it["ref"] == ref), None)
    assert match is not None, f"pending survey request for {ref} missing from unified schedule"
    assert match["kind"] == "survey_requested"
    assert match["service"] == "ev"
    assert match["pending"] is True


@needs_stack
def test_service_notification_templates_seeded():
    # Regression for a merge-without-overwrite bug: bootstrap_service mutated SystemSetting.value
    # (a plain JSONB dict) in place, which SQLAlchemy never tracks as dirty, so new default keys
    # silently never reached an *existing* row (only fresh inserts worked). Fixed via flag_modified.
    headers = _admin_headers()
    r = httpx.get(_url("/api/v1/admin/settings"), headers=headers, timeout=20)
    assert r.status_code == 200
    rows = {row["key"]: row["value"] for row in r.json()}
    email_keys = set(rows.get("email_templates") or {})
    sms_keys = set(rows.get("sms_templates") or {})
    expected = {
        "service_submission_confirm",
        "service_scheduled",
        "bird_quote_ready",
        "bird_install_scheduled",
        "service_completed",
        "cleaning_subscription_confirm",
        "cleaning_visit_upcoming",
        "cleaning_visit_completed",
    }
    assert expected <= email_keys, f"missing from email_templates: {expected - email_keys}"
    assert expected <= sms_keys, f"missing from sms_templates: {expected - sms_keys}"


# ── bird netting: survey → draft → preview → send → revise → approve → install → complete ──
PHOTO = "/uploads/services/mock-test-1.png"
SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8O0kAAAAASUVORK5CYII="


def _slots(n: int) -> list[str]:
    r = httpx.get(_url("/api/v1/public/services/slots"), timeout=15)
    assert r.status_code == 200
    slots = r.json().get("slots") or []
    if len(slots) < n:
        pytest.skip(f"need {n} free slots in the booking window")
    return slots[:n]


def _adm(method: str, path: str, headers: dict[str, str], **kw) -> httpx.Response:
    return httpx.request(method, _url("/api/v1/admin" + path), headers=headers, timeout=20, **kw)


def _new_bird(slot: str, headers: dict[str, str]) -> tuple[str, str]:
    r = httpx.post(
        _url("/api/v1/public/services/bookings"),
        json={
            "service_type": "bird_netting",
            "customer_name": "Bird Tester",
            "phone": "+14035550113",
            "email": "bird@example.com",
            "address": "3 Test Ave, Calgary, AB",
            "panel_count": 24,
            "start_at": slot,
            "disclaimer_accepted": True,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    lst = _adm("GET", "/services/bookings?type=bird_netting", headers)
    assert lst.status_code == 200
    booking = next(b for b in lst.json() if b["access_token"] == token)
    return token, booking["id"]


def _pub_status(token: str) -> dict:
    r = httpx.get(_url(f"/api/v1/public/services/bookings/{token}"), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _pub_quote(token: str, **params) -> httpx.Response:
    return httpx.get(_url(f"/api/v1/public/services/bird-netting/quote/{token}"), params=params, timeout=15)


def _pub_approve(token: str) -> httpx.Response:
    return httpx.post(
        _url(f"/api/v1/public/services/bird-netting/quote/{token}/approve"),
        json={"signature_data": SIG, "signed_name": "Bird Tester"},
        timeout=20,
    )


def _survey(bid: str, headers: dict[str, str], **override) -> httpx.Response:
    body = {"perimeter_ft": 230, "nest_count": 1, "notes": "Mock-test", "photo_urls": [PHOTO], **override}
    return _adm("POST", f"/services/bookings/{bid}/survey-result", headers, json=body)


def _draft(bid: str, headers: dict[str, str], **body) -> httpx.Response:
    return _adm("PUT", f"/services/bookings/{bid}/quote-draft", headers, json=body)


@needs_stack
def test_bird_full_flow_money_visibility_and_stages():
    headers = _admin_headers()
    token, bid = _new_bird(_slots(1)[0], headers)

    d = _adm("GET", f"/services/bookings/{bid}", headers).json()
    assert d["status"] == "survey_scheduled"
    assert d["survey"] is None and d["quote"] is None

    # survey result → surveyed (no notification, nothing customer-visible yet)
    r = _survey(bid, headers)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["status"] == "surveyed"
    assert v["survey"]["suggested_rolls"] == 3
    assert v["surveyed_at"] is not None
    pub = _pub_status(token)
    assert pub["status"] == "surveyed"
    assert pub.get("quote") is None and pub.get("survey") is None
    assert _pub_quote(token).status_code == 404

    # quote draft: money literals (230 ft → 3 rolls + 1 nest)
    r = _draft(bid, headers, roll_count=3, nest_count=1)
    assert r.status_code == 200, r.text
    v = r.json()
    q = v["quote"]
    assert q["subtotal"] == 1896.0
    assert q["gst_rate"] == 5.0
    assert q["gst_amount"] == 94.8
    assert q["total"] == 1990.8
    assert q["deposit_amount"] == 597.24
    assert q["balance_amount"] == 1393.56
    assert q["sent_at"] is None
    assert v["status"] == "surveyed"

    # the draft is invisible to the customer and cannot be signed
    assert _pub_status(token).get("quote") is None
    assert _pub_quote(token).status_code == 404
    assert _pub_approve(token).status_code == 400

    # admin preview link opens exactly the customer page, only with a valid token
    d = _adm("GET", f"/services/bookings/{bid}", headers).json()
    assert "?preview=" in d["quote"]["preview_url"]
    jwt_token = d["quote"]["preview_url"].split("?preview=", 1)[1]
    pv = _pub_quote(token, preview=jwt_token)
    assert pv.status_code == 200, pv.text
    assert pv.json()["preview"] is True
    assert pv.json()["total"] == 1990.8
    assert _pub_quote(token, preview="garbage").status_code == 404
    assert _pub_quote(token).status_code == 404

    # send → quoted; now the customer sees quote + survey
    r = _adm("POST", f"/services/bookings/{bid}/quote/send", headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "quoted"
    assert r.json()["quote"]["sent_at"] is not None
    pq = _pub_quote(token)
    assert pq.status_code == 200, pq.text
    body = pq.json()
    assert body["preview"] is False
    assert body["total"] == 1990.8
    assert body["deposit_amount"] == 597.24
    assert body["balance_amount"] == 1393.56
    assert body["survey"]["perimeter_ft"] == 230
    assert body["survey"]["photo_urls"] == [PHOTO]
    pub = _pub_status(token)
    assert pub["quote"] is not None and pub["survey"] is not None

    # a sent quote cannot be edited in place; revise re-hides it
    assert _draft(bid, headers, roll_count=3, nest_count=1).status_code == 400
    r = _adm("POST", f"/services/bookings/{bid}/quote/revise", headers)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "surveyed"
    assert r.json()["quote"]["sent_at"] is None
    assert _pub_quote(token).status_code == 404
    assert _pub_status(token).get("quote") is None

    # send again → customer signs
    assert _adm("POST", f"/services/bookings/{bid}/quote/send", headers).status_code == 200
    ap = _pub_approve(token)
    assert ap.status_code == 200, ap.text
    assert ap.json() == {"ok": True, "status": "approved"}

    d = _adm("GET", f"/services/bookings/{bid}", headers).json()
    assert d["status"] == "approved"
    assert d["quote"]["status"] == "approved"
    assert d["quote"]["total"] == 1990.8
    assert d["quote"]["deposit_amount"] == 597.24
    assert d["quote"]["balance_amount"] == 1393.56
    assert _adm("POST", f"/services/bookings/{bid}/quote/revise", headers).status_code == 400
    assert _pub_status(token)["etransfer_email"]

    # install → complete
    r = _adm("POST", f"/services/bookings/{bid}/schedule", headers, json={"start_at": _slots(1)[0], "technician": "Mock-Tech"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "install_scheduled"
    r = _adm("POST", f"/services/bookings/{bid}/status", headers, json={"status": "completed", "completion_notes": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "completed"


@needs_stack
def test_bird_reschedule_survey_returns_200():
    headers = _admin_headers()
    slot1, slot2 = _slots(2)
    _, bid = _new_bird(slot1, headers)
    r = _adm("POST", f"/services/bookings/{bid}/schedule", headers, json={"start_at": slot2})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "survey_scheduled"
    assert datetime.fromisoformat(r.json()["scheduled_at"]) == datetime.fromisoformat(slot2)


@needs_stack
def test_bird_status_endpoint_blocks_stage_skipping():
    headers = _admin_headers()
    _, bid = _new_bird(_slots(1)[0], headers)
    for status in ("quoted", "surveyed", "approved", "install_scheduled"):
        r = _adm("POST", f"/services/bookings/{bid}/status", headers, json={"status": status})
        assert r.status_code == 400, (status, r.text)
    r = _adm("POST", f"/services/bookings/{bid}/status", headers, json={"status": "cancelled"})
    assert r.status_code == 200, r.text


@needs_stack
def test_bird_validation_boundaries():
    headers = _admin_headers()
    _, bid = _new_bird(_slots(1)[0], headers)
    assert _draft(bid, headers, roll_count=3, nest_count=1).status_code == 400  # no survey yet
    for bad in (
        {"perimeter_ft": 0},
        {"perimeter_ft": 50001},
        {"nest_count": -1},
        {"photo_urls": ["https://evil.example/x.png"]},
        {"photo_urls": ["/uploads/services/../../etc/passwd"]},
    ):
        r = _survey(bid, headers, **bad)
        assert r.status_code == 400, (bad, r.text)
    assert _survey(bid, headers).status_code == 200
    assert _draft(bid, headers, roll_count=2, nest_count=1).status_code == 400  # differs from 3, no reason
    reason = "extra roll for split arrays"
    r = _draft(bid, headers, roll_count=2, nest_count=1, roll_override_reason=reason)
    assert r.status_code == 200, r.text
    assert r.json()["quote"]["roll_override_reason"] == reason
    assert _draft(bid, headers, roll_count=0, nest_count=0).status_code == 400
    assert _draft(bid, headers, roll_count=1001, nest_count=0).status_code == 400


@needs_stack
def test_bird_old_quote_endpoint_is_gone():
    headers = _admin_headers()
    _, bid = _new_bird(_slots(1)[0], headers)
    r = _adm("POST", f"/services/bookings/{bid}/quote", headers, json={"roll_count": 1, "nest_count": 0})
    assert r.status_code == 404


@needs_stack
def test_bird_dashboard_outstanding_excludes_unsent_drafts():
    headers = _admin_headers()

    def outstanding() -> float:
        r = _adm("GET", "/services/dashboard", headers)
        assert r.status_code == 200, r.text
        return r.json()["per_service"]["bird_netting"]["outstanding_quote_value"]

    v0 = outstanding()
    _, bid = _new_bird(_slots(1)[0], headers)
    assert _survey(bid, headers).status_code == 200
    assert _draft(bid, headers, roll_count=3, nest_count=1).status_code == 200
    assert abs(outstanding() - v0) < 0.005
    assert _adm("POST", f"/services/bookings/{bid}/quote/send", headers).status_code == 200
    assert abs(outstanding() - (v0 + 1990.80)) < 0.005


@needs_stack
def test_bird_send_rechecks_override_after_survey_change():
    headers = _admin_headers()
    _, bid = _new_bird(_slots(1)[0], headers)
    assert _survey(bid, headers).status_code == 200  # 230 ft → suggested 3
    assert _draft(bid, headers, roll_count=3, nest_count=1).status_code == 200  # matches, no reason stored
    assert _survey(bid, headers, perimeter_ft=330).status_code == 200  # re-recorded → suggested 4
    r = _adm("POST", f"/services/bookings/{bid}/quote/send", headers)
    assert r.status_code == 400, r.text
    assert _adm("GET", f"/services/bookings/{bid}", headers).json()["status"] == "surveyed"
    r = _draft(bid, headers, roll_count=3, nest_count=1, roll_override_reason="south face needs no netting")
    assert r.status_code == 200, r.text
    assert _adm("POST", f"/services/bookings/{bid}/quote/send", headers).status_code == 200
