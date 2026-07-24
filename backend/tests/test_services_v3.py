"""v3.0 four-service portal tests.

Pure unit tests (no DB / no stack) for cleaning tier resolution, plus integration tests (live
stack, same httpx style as test_e2e_flow.py) for: shared capacity pool, diagnostic booking,
bird-netting quote+approval, and cleaning subscription+visit flow.

The integration tests require a running backend at head (with the v3 migration applied) and an
admin login (ADMIN_USERNAME/ADMIN_PASSWORD, default admin/admin1234 in development).
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx
import pytest

from app.services.service_pricing import DEFAULT_SERVICE_PRICING, resolve_cleaning_tier
from app.models.models import CleaningTier


# ── pure unit: tier resolution ──
def test_cleaning_tier_resolution():
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
    assert body["bird_netting_nest_fee"] == 199.0


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
def test_bird_netting_quote_and_approve():
    slot = _first_slot()
    if not slot:
        pytest.skip("no available slots in booking window")
    headers = _admin_headers()

    # Submit a bird-netting booking (drone survey self-booked at submission).
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

    # Admin: find the booking id.
    lst = httpx.get(_url("/api/v1/admin/services/bookings?type=bird_netting"), headers=headers, timeout=20)
    assert lst.status_code == 200
    booking = next(b for b in lst.json() if b["access_token"] == token)
    assert booking["status"] == "survey_scheduled"
    booking_id = booking["id"]

    # Admin: enter a quote (2 rolls, 1 nest) -> status quoted.
    q = httpx.post(
        _url(f"/api/v1/admin/services/bookings/{booking_id}/quote"),
        headers=headers,
        json={"roll_count": 2, "nest_count": 1},
        timeout=20,
    )
    assert q.status_code == 200, q.text
    assert q.json()["status"] == "quoted"
    assert q.json()["quote"]["total"] == 2 * 599.0 + 1 * 199.0

    # Public: view + approve with a signature.
    view = httpx.get(_url(f"/api/v1/public/services/bird-netting/quote/{token}"), timeout=15)
    assert view.status_code == 200
    sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8O0kAAAAASUVORK5CYII="
    ap = httpx.post(
        _url(f"/api/v1/public/services/bird-netting/quote/{token}/approve"),
        json={"signature_data": sig, "signed_name": "Bird Tester"},
        timeout=20,
    )
    assert ap.status_code == 200, ap.text
    assert ap.json()["status"] == "approved"

    # Booking is now approved (ready for install scheduling).
    detail = httpx.get(_url(f"/api/v1/admin/services/bookings/{booking_id}"), headers=headers, timeout=15)
    assert detail.json()["status"] == "approved"


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
def test_unified_schedule_aggregates_services():
    headers = _admin_headers()
    r = httpx.get(_url("/api/v1/admin/services/schedule"), headers=headers, timeout=20)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    # Every item carries a service classification derived from its appointment kind.
    for it in items:
        assert it["service"] in {"ev", "diagnostic", "bird_netting", "cleaning", "other"}
