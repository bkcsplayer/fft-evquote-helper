"""
Integration tests for the Phase 6 case-aggregate endpoints (live stack, same style as the others):
payment ledger + deposit sync, BOM + generate-quote, per-case financials, attachment center.
"""

import os
from datetime import datetime, timedelta, timezone

import httpx


def _api_base() -> str:
    return os.environ.get("API_BASE", "http://backend:8000").rstrip("/")


def _url(path: str) -> str:
    return f"{_api_base()}{path}"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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


def _new_case(headers: dict[str, str]) -> tuple[str, str]:
    brands = httpx.get(_url("/api/v1/charger-brands"), timeout=15).json()
    payload = {
        "customer": {"nickname": "AggTest", "phone": "+14035550111", "email": "agg@example.com"},
        "charger_brand": brands[0]["name"],
        "ev_brand": "Tesla",
        "install_address": "1 Test Rd, Calgary, AB, Canada",
        "preferred_survey_slots": {"slots": ["morning"]},
    }
    submitted = httpx.post(_url("/api/v1/cases"), json=payload, timeout=20)
    assert submitted.status_code == 200, submitted.text
    token = submitted.json()["access_token"]
    ref = submitted.json()["reference_number"]
    cases = httpx.get(_url(f"/api/v1/admin/cases?q={ref}"), headers=headers, timeout=20).json()
    return token, cases[0]["id"]


def _schedule_survey(headers: dict[str, str], token: str, case_id: str) -> None:
    when = datetime.now(timezone.utc) + timedelta(days=2)
    req = httpx.post(_url(f"/api/v1/cases/survey/request/{token}"), json={"requested_date": _iso(when)}, timeout=20)
    assert req.status_code == 200, req.text
    sched = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/survey/schedule"),
        headers=headers, json={"scheduled_date": _iso(when)}, timeout=20,
    )
    assert sched.status_code == 200, sched.text


def test_payment_ledger_and_deposit_sync():
    headers = _admin_headers()
    token, case_id = _new_case(headers)
    _schedule_survey(headers, token, case_id)  # creates the survey (deposit unpaid)

    # Record a pending deposit, then confirm it received.
    created = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/payments"),
        headers=headers,
        json={"kind": "deposit", "method": "etransfer", "amount": 99.0, "status": "pending"},
        timeout=20,
    )
    assert created.status_code == 200, created.text
    pid = created.json()["id"]

    updated = httpx.patch(
        _url(f"/api/v1/admin/payments/{pid}"),
        headers=headers, json={"status": "received"}, timeout=20,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "received"

    # Deposit sync: the public status now reports the deposit as paid.
    status = httpx.get(_url(f"/api/v1/cases/status/{token}"), timeout=20).json()
    assert status.get("survey_deposit_paid") is True

    listed = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/payments"), headers=headers, timeout=20)
    assert listed.status_code == 200
    assert any(p["id"] == pid for p in listed.json())


def test_bom_generate_quote_and_financials():
    headers = _admin_headers()
    token, case_id = _new_case(headers)

    # Two BOM lines: cost vs sell distinct.
    l1 = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/bom"),
        headers=headers,
        json={"description": "Wall connector", "qty": 1, "unit_cost": 300, "unit_price": 500},
        timeout=20,
    )
    assert l1.status_code == 200, l1.text
    l2 = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/bom"),
        headers=headers,
        json={"description": "Cable (10m)", "qty": 10, "unit_cost": 5, "unit_price": 12},
        timeout=20,
    )
    assert l2.status_code == 200, l2.text

    bom = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/bom"), headers=headers, timeout=20).json()
    # sell = 1*500 + 10*12 = 620 ; cost = 1*300 + 10*5 = 350
    assert abs(bom["total_sell"] - 620.0) < 0.001
    assert abs(bom["total_cost"] - 350.0) < 0.001

    gen = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/bom/generate-quote"),
        headers=headers, json={"install_type": "surface_mount", "permit_fee": 0, "gst_rate": 5}, timeout=30,
    )
    assert gen.status_code == 200, gen.text
    assert abs(gen.json()["base_price"] - 620.0) < 0.001

    fin = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/financials"), headers=headers, timeout=20)
    assert fin.status_code == 200, fin.text
    data = fin.json()
    # revenue_ex_gst = subtotal = base 620 (permit 0, no credit) ; cost = 350 ; margin = 270
    assert abs(data["cost"] - 350.0) < 0.001
    assert abs(data["revenue_ex_gst"] - 620.0) < 0.001
    assert abs(data["margin"] - 270.0) < 0.001
    assert data["has_quote"] is True


def test_attachment_upload_list_delete():
    headers = _admin_headers()
    _token, case_id = _new_case(headers)

    up = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/attachments"),
        headers=headers,
        params={"category": "contract", "caption": "signed contract"},
        files={"file": ("contract.pdf", b"%PDF-1.4 fake", "application/pdf")},
        timeout=20,
    )
    assert up.status_code == 200, up.text
    att_id = up.json()["id"]
    assert up.json()["category"] == "contract"
    assert up.json()["deletable"] is True

    listed = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/attachments"), headers=headers, timeout=20)
    assert listed.status_code == 200
    assert any(a["id"] == att_id for a in listed.json())

    deleted = httpx.delete(_url(f"/api/v1/admin/attachments/{att_id}"), headers=headers, timeout=20)
    assert deleted.status_code == 200
    after = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/attachments"), headers=headers, timeout=20).json()
    assert not any(a["id"] == att_id for a in after)


def test_materials_catalog_crud():
    headers = _admin_headers()
    sku = f"SKU-{datetime.now(timezone.utc).strftime('%H%M%S%f')}"
    created = httpx.post(
        _url("/api/v1/admin/materials"),
        headers=headers,
        json={"sku": sku, "name": "Breaker 40A", "category": "breaker", "default_unit_cost": 20, "default_sell_price": 45},
        timeout=20,
    )
    assert created.status_code == 200, created.text
    mid = created.json()["id"]

    patched = httpx.patch(_url(f"/api/v1/admin/materials/{mid}"), headers=headers, json={"default_sell_price": 50}, timeout=20)
    assert patched.status_code == 200
    assert abs(patched.json()["default_sell_price"] - 50.0) < 0.001

    listed = httpx.get(_url("/api/v1/admin/materials"), headers=headers, timeout=20).json()
    assert any(m["id"] == mid for m in listed)
