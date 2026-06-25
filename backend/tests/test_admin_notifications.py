"""
Integration tests for the customer-action -> admin-email notifications (Phase 1).

Runs against a live stack (same style as test_e2e_flow.py). Asserts that each
customer-facing action records an `admin_*` Notification row, that the e-transfer
report sets the structured `survey_deposit_reported` flag, and that quote approval
captures the signing language.

Admin email rows are recorded in the Notification table regardless of whether SMTP
is configured (a send failure is stored as status=failed, the row still exists),
so these assertions are robust without a real SMTP server — provided
ADMIN_NOTIFY_EMAIL (or BOOTSTRAP_ADMIN_EMAIL) is set (see docker-compose.test.yml).
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


def _templates_for_case(headers: dict[str, str], case_id: str) -> list[str]:
    resp = httpx.get(_url(f"/api/v1/admin/cases/{case_id}/notifications"), headers=headers, timeout=20)
    assert resp.status_code == 200, resp.text
    return [n["template_name"] for n in resp.json()]


def _schedule_survey(headers: dict[str, str], token: str, case_id: str) -> None:
    """Drive the customer->admin survey handshake: customer requests a time, admin confirms it."""
    when = datetime.now(timezone.utc) + timedelta(days=2)
    req = httpx.post(
        _url(f"/api/v1/cases/survey/request/{token}"),
        json={"requested_date": _iso(when), "note": ""},
        timeout=20,
    )
    assert req.status_code == 200, req.text
    # Admin must confirm the SAME time the customer requested (matched within 60s).
    sched = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/survey/schedule"),
        headers=headers,
        json={"scheduled_date": _iso(when)},
        timeout=20,
    )
    assert sched.status_code == 200, sched.text


def _submit_case(headers: dict[str, str]) -> tuple[str, str, str]:
    brands = httpx.get(_url("/api/v1/charger-brands"), timeout=15).json()
    payload = {
        "customer": {"nickname": "AdminNotify", "phone": "+14035550199", "email": "adminnotify@example.com"},
        "charger_brand": brands[0]["name"],
        "ev_brand": "Tesla",
        "install_address": "456 5 Ave SW, Calgary, AB, Canada",
        "preferred_survey_slots": {"slots": ["morning"]},
        "notes": "admin-notify pytest",
    }
    submitted = httpx.post(_url("/api/v1/cases"), json=payload, timeout=20)
    assert submitted.status_code == 200, submitted.text
    token = submitted.json()["access_token"]
    ref = submitted.json()["reference_number"]

    cases = httpx.get(_url(f"/api/v1/admin/cases?q={ref}"), headers=headers, timeout=20).json()
    assert cases and cases[0]["id"]
    return token, ref, cases[0]["id"]


def test_new_request_emails_admin():
    headers = _admin_headers()
    _token, _ref, case_id = _submit_case(headers)
    assert "admin_new_request" in _templates_for_case(headers, case_id)


def test_survey_request_emails_admin():
    headers = _admin_headers()
    token, _ref, case_id = _submit_case(headers)
    req = httpx.post(
        _url(f"/api/v1/cases/survey/request/{token}"),
        json={"requested_date": _iso(datetime.now(timezone.utc) + timedelta(days=3)), "note": "morning please"},
        timeout=20,
    )
    assert req.status_code == 200, req.text
    assert "admin_survey_requested" in _templates_for_case(headers, case_id)


def test_etransfer_report_sets_flag_and_emails_admin():
    headers = _admin_headers()
    token, ref, case_id = _submit_case(headers)

    # Survey must be scheduled before e-transfer can be reported.
    _schedule_survey(headers, token, case_id)

    notify = httpx.post(
        _url("/api/v1/payments/etransfer-notify"),
        json={"token": token, "sender_name": "AdminNotify", "note": "sent"},
        timeout=20,
    )
    assert notify.status_code == 200, notify.text

    # Structured flag is surfaced on the public status payload (no timeline string-matching).
    status = httpx.get(_url(f"/api/v1/cases/status/{token}"), timeout=20).json()
    assert status.get("survey_deposit_reported") is True

    assert "admin_etransfer_reported" in _templates_for_case(headers, case_id)


def test_quote_approval_records_language_and_emails_admin():
    headers = _admin_headers()
    token, ref, case_id = _submit_case(headers)

    # Drive the case to a sendable quote.
    _schedule_survey(headers, token, case_id)
    httpx.patch(
        _url(f"/api/v1/admin/cases/{case_id}/survey/deposit-paid"),
        headers=headers,
        json={"note": "paid"},
        timeout=20,
    )
    httpx.patch(
        _url(f"/api/v1/admin/cases/{case_id}/survey/complete"),
        headers=headers,
        json={"survey_notes": "ok"},
        timeout=20,
    )
    quote = httpx.post(
        _url(f"/api/v1/admin/cases/{case_id}/quotes"),
        headers=headers,
        json={
            "install_type": "surface_mount",
            "base_price": 699,
            "extra_distance_rate": 30,
            "permit_fee": 349,
            "survey_credit": 99,
            "gst_rate": 5,
            "addons": [],
        },
        timeout=30,
    )
    assert quote.status_code == 200, quote.text
    quote_id = quote.json()["id"]
    httpx.post(_url(f"/api/v1/admin/quotes/{quote_id}/send"), headers=headers, timeout=20)

    sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X8O0kAAAAASUVORK5CYII="
    approved = httpx.post(
        _url(f"/api/v1/quotes/approve/{token}"),
        json={
            "agreed": True,
            "signed_name": "Admin Notify",
            "signature_data": sig,
            "language": "zh",
            "terms_text": "条款一\n正文一\n\n条款二\n正文二",
        },
        timeout=25,
    )
    assert approved.status_code == 200, approved.text
    sig_out = approved.json().get("signature")
    assert sig_out and sig_out.get("signed_language") == "zh"
    assert sig_out.get("terms_snapshot")

    assert "admin_quote_approved" in _templates_for_case(headers, case_id)
