"""Assertion-level tests for app/utils/money.py (GST 5%, 30% deposit, HALF_UP). No pytest.

Run: python -m tests.test_money
Expected values are literals from the spec, never recomputed with the code under test.
"""

from __future__ import annotations

from decimal import Decimal as D

from app.utils.money import deposit_split, suggested_rolls, to_money, with_gst


def test_1_contract_vector_gst():
    assert with_gst(D("1896.00")) == (D("1896.00"), D("94.80"), D("1990.80"))


def test_2_contract_vector_deposit():
    assert deposit_split(D("1990.80")) == (D("597.24"), D("1393.56"))


def test_3_half_up_not_bankers():
    assert with_gst(D("100.10"))[1] == D("5.01")
    assert deposit_split(D("628.95")) == (D("188.69"), D("440.26"))


def test_4_cleaning_vector():
    assert with_gst(D("599")) == (D("599.00"), D("29.95"), D("628.95"))


def test_5_rounding_vector():
    assert with_gst(D("447.50")) == (D("447.50"), D("22.38"), D("469.88"))


def test_6_scale_exactly_two():
    assert [str(x) for x in with_gst(D("1896"))] == ["1896.00", "94.80", "1990.80"]
    assert [str(x) for x in deposit_split(D("1990.80"))] == ["597.24", "1393.56"]


def test_7_floats_accepted():
    assert with_gst(1896.0) == with_gst(D("1896.00"))
    assert to_money(0.1 + 0.2) == D("0.30")


def test_8_zero():
    assert with_gst(0) == (D("0.00"), D("0.00"), D("0.00"))
    assert deposit_split(0) == (D("0.00"), D("0.00"))


def test_9_suggested_rolls():
    assert [suggested_rolls(x) for x in (0, 1, 99, 100, 101, 230, 300)] == [0, 1, 1, 1, 2, 3, 3]
    assert suggested_rolls(-5) == 0
    assert suggested_rolls(None) == 0


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} money tests passed.")
