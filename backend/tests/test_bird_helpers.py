"""Tests for the bird-netting pure helpers in service_booking_flow.py — no pytest.

Run: python -m tests.test_bird_helpers
Invoice line items must sum to the subtotal (the class of bug that hit Raju's invoice);
the preview token must only ever open its own booking's draft.
"""

from __future__ import annotations

import time
from types import SimpleNamespace

from jose import jwt

from app.config import get_settings
from app.services.service_booking_flow import bird_invoice_items, make_preview_token, verify_preview_token


def _q(rolls, nests):
    return SimpleNamespace(roll_count=rolls, nest_count=nests, roll_price_snapshot=599.0, nest_fee_snapshot=99.0)


def test_1_items_sum_to_subtotal():
    items = bird_invoice_items(_q(3, 1))
    assert len(items) == 2
    assert round(sum(i["amount"] for i in items), 2) == 1896.00


def test_2_no_nest_line_without_nests():
    items = bird_invoice_items(_q(2, 0))
    assert len(items) == 1
    assert round(sum(i["amount"] for i in items), 2) == 1198.00


def test_3_token_valid_for_its_booking():
    assert verify_preview_token(make_preview_token("b-1"), "b-1") is True


def test_4_token_rejected_for_other_booking():
    assert verify_preview_token(make_preview_token("b-1"), "b-2") is False


def test_5_scope_and_expiry_enforced():
    secret = get_settings().secret_key
    future = int(time.time()) + 600
    admin_like = jwt.encode({"sub": "b-1", "role": "super_admin", "exp": future}, secret, algorithm="HS256")
    assert verify_preview_token(admin_like, "b-1") is False
    expired = jwt.encode(
        {"sub": "b-1", "scope": "bird_quote_preview", "exp": int(time.time()) - 60}, secret, algorithm="HS256",
    )
    assert verify_preview_token(expired, "b-1") is False


def test_6_garbage_rejected():
    assert verify_preview_token("garbage", "b-1") is False
    assert verify_preview_token("", "b-1") is False


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} bird-helper tests passed.")
