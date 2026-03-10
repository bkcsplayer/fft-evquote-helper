import os
from datetime import datetime, timedelta, timezone

import httpx


def _api_base() -> str:
    base = os.environ.get("API_BASE", "http://backend:8000").rstrip("/")
    return base


def _url(path: str) -> str:
    return f"{_api_base()}{path}"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def test_health_has_request_id():
    r = httpx.get(_url("/health"), timeout=10)
    assert r.status_code == 200
    assert r.headers.get("x-request-id")
    assert r.json().get("ok") is True


def test_full_business_flow():
    # Public: charger brands
    brands = httpx.get(_url("/api/v1/charger-brands"), timeout=15)
    assert brands.status_code == 200
    assert isinstance(brands.json(), list)
    assert len(brands.json()) > 0

    # Public: submit case
    payload = {
        "customer": {"nickname": "PySmoke", "phone": "+14035550123", "email": "pysmoke@example.com"},
        "charger_brand": brands.json()[0]["name"],
        "ev_brand": "Tesla",
        "install_address": "123 4 Ave SW, Calgary, AB, Canada",
        "pickup_date": None,
        "preferred_install_date": None,
        "referrer": "pysmoke",
        "preferred_survey_slots": {"slots": ["morning", "afternoon"]},
        "notes": "docker pytest e2e",
    }
    submitted = httpx.post(_url("/api/v1/cases"), json=payload, timeout=20)
    assert submitted.status_code == 200
    token = submitted.json()["access_token"]
    ref = submitted.json()["reference_number"]

    # Admin: login
    admin_username = os.environ.get("ADMIN_USERNAME", "admin")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin1234")
    login = httpx.post(
        _url("/api/v1/admin/auth/login"),
        json={"username": admin_username, "password": admin_password},
        timeout=15,
    )
    assert login.status_code == 200
    admin_token = login.json()["access_token"]
    headers = {"authorization": f"Bearer {admin_token}"}

    # Admin: find case id
    cases = httpx.get(_url(f"/api/v1/admin/cases?q={ref}"), headers=headers, timeout=20)
    assert cases.status_code == 200
    data = cases.json()
    assert isinstance(data, list) and data and data[0]["id"]
    case_id = data[0]["id"]

    # Admin: schedule survey
    survey_dt = datetime.now(timezone.utc) + timedelta(days=2)
    scheduled = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/survey/schedule"),
        headers=headers,
        json={"scheduled_date": _iso(survey_dt)},
        timeout=20,
    )
    assert scheduled.status_code == 200

    # Public: e-transfer info
    et = httpx.get(_url(f"/api/v1/payments/etransfer-info/{token}"), timeout=20)
    assert et.status_code == 200
    assert et.json()["reference_number"] == ref

    # Public: customer notifies transfer sent
    notify = httpx.post(
        _url("/api/v1/payments/etransfer-notify"),
        json={"token": token, "sender_name": "PySmoke", "note": "sent"},
        timeout=20,
    )
    assert notify.status_code == 200

    # Admin: mark deposit paid
    paid = httpx.patch(
        _url(f"/api/v1/admin/cases/{case_id}/survey/deposit-paid"),
        headers=headers,
        json={"note": "Deposit marked paid (pytest)"},
        timeout=20,
    )
    assert paid.status_code == 200

    # Admin: complete survey
    done = httpx.patch(
        _url(f"/api/v1/admin/cases/{case_id}/survey/complete"),
        headers=headers,
        json={"survey_notes": "ok"},
        timeout=20,
    )
    assert done.status_code == 200

    # Admin: create quote
    quote_in = {
        "install_type": "surface_mount",
        "base_price": 699,
        "extra_distance_meters": 0,
        "extra_distance_rate": 30,
        "permit_fee": 349,
        "survey_credit": 99,
        "gst_rate": 5,
        "customer_notes": "Thank you",
        "admin_notes": "pytest",
        "addons": [{"name": "NEMA 14-50 upgrade", "price": 149, "description": ""}],
    }
    quote = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/quotes"),
        headers=headers,
        json=quote_in,
        timeout=30,
    )
    assert quote.status_code == 200
    quote_id = quote.json()["id"]

    # Admin: send quote
    sent = httpx.post(_url(f"/api/v1/admin/quotes/{quote_id}/send"), headers=headers, timeout=20)
    assert sent.status_code == 200

    # Public: approve quote
    sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8O0kAAAAASUVORK5CYII="
    approved = httpx.post(
        _url(f"/api/v1/quotes/approve/{token}"),
        json={"agreed": True, "signed_name": "Py Smoke", "signature_data": sig},
        timeout=25,
    )
    assert approved.status_code == 200
    assert approved.json().get("signature")

    # Admin: permit applied -> approved
    today = datetime.now().date().isoformat()
    permit_applied = {
        "permit_number": f"P-{ref}",
        "applied_date": today,
        "expected_approval_date": None,
        "actual_approval_date": None,
        "status": "applied",
        "notes": "submitted",
    }
    p1 = httpx.post(_url(f"/api/v1/admin/cases/{case_id}/permit"), headers=headers, json=permit_applied, timeout=20)
    assert p1.status_code == 200

    permit_approved = dict(permit_applied)
    permit_approved["status"] = "approved"
    permit_approved["actual_approval_date"] = today
    p2 = httpx.post(_url(f"/api/v1/admin/cases/{case_id}/permit"), headers=headers, json=permit_approved, timeout=20)
    assert p2.status_code == 200

    # Admin: installation schedule -> complete -> completion email (case completed)
    install_dt = datetime.now(timezone.utc) + timedelta(days=10)
    i1 = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/installation/schedule"),
        headers=headers,
        json={"scheduled_date": _iso(install_dt), "notes": "bring ladder"},
        timeout=20,
    )
    assert i1.status_code == 200

    i2 = httpx.patch(
        _url(f"/api/v1/admin/cases/{case_id}/installation/complete"),
        headers=headers,
        json={"notes": "done"},
        timeout=20,
    )
    assert i2.status_code == 200

    i3 = httpx.post(_url(f"/api/v1/admin/cases/{case_id}/completion-email"), headers=headers, timeout=20)
    assert i3.status_code == 200

    # Public: final status
    st = httpx.get(_url(f"/api/v1/cases/status/{token}"), timeout=20)
    assert st.status_code == 200
    assert st.json()["status"] == "completed"

