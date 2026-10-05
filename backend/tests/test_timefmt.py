"""Tests for app/utils/timefmt.py (customer-facing Calgary time). Plain asserts: runs standalone or under pytest (hermetic stack).

Run: python -m tests.test_timefmt
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.utils.timefmt import CALGARY_TZ, calgary_date_iso, fmt_calgary


def test_1_summer():
    assert fmt_calgary(datetime(2026, 10, 9, 14, 0, tzinfo=timezone.utc)) == "Fri, Oct 9, 8:00 AM (Calgary time)"


def test_2_winter_2026():
    assert fmt_calgary(datetime(2026, 1, 15, 16, 0, tzinfo=timezone.utc)) == "Thu, Jan 15, 9:00 AM (Calgary time)"


def test_3_naive_is_utc():
    assert fmt_calgary(datetime(2026, 10, 9, 14, 0)) == "Fri, Oct 9, 8:00 AM (Calgary time)"


def test_4_noon_and_midnight():
    assert fmt_calgary(datetime(2026, 10, 9, 18, 5, tzinfo=timezone.utc)) == "Fri, Oct 9, 12:05 PM (Calgary time)"
    assert fmt_calgary(datetime(2026, 10, 9, 6, 5, tzinfo=timezone.utc)) == "Fri, Oct 9, 12:05 AM (Calgary time)"


def test_5_calgary_date_iso():
    assert calgary_date_iso(datetime(2026, 10, 10, 3, 30, tzinfo=timezone.utc)) == "2026-10-09"


def test_6_no_fall_back_2026():
    # ADR-021 (law-driven spec correction): Alberta Official Time Act — permanent UTC-6 from
    # 2026-11-01, clocks do not fall back. 07:30Z is still MDT (UTC-6); 08:30Z is the new UTC-6.
    assert fmt_calgary(datetime(2026, 11, 1, 7, 30, tzinfo=timezone.utc)) == "Sun, Nov 1, 1:30 AM (Calgary time)"
    assert fmt_calgary(datetime(2026, 11, 1, 8, 30, tzinfo=timezone.utc)) == "Sun, Nov 1, 2:30 AM (Calgary time)"


def test_8_future_winter_is_utc_minus_6():
    assert fmt_calgary(datetime(2027, 1, 15, 15, 0, tzinfo=timezone.utc)) == "Fri, Jan 15, 9:00 AM (Calgary time)"


def test_7_zone_key():
    assert CALGARY_TZ.key == "America/Edmonton"


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} timefmt tests passed.")
