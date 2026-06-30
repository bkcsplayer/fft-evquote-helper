"""Unit tests for the pure booking logic — no DB, no live stack.

Run under pytest, or directly for a quick check (no pytest needed):
    docker exec -w /app -e PYTHONPATH=/app fft-evquote-helper-backend-1 python tests/test_booking_logic.py
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.availability import available_slots, generate_candidate_slots
from app.services.booking_config import DEFAULT_BOOKING_CONFIG, DEFAULT_SERVICE_AREA
from app.services.service_area import check_service_area

TZ = ZoneInfo("America/Edmonton")
NOW = datetime(2026, 6, 29, 10, 0, tzinfo=TZ)  # Mon


def cfg(**over):
    return {**DEFAULT_BOOKING_CONFIG, **over}


# ── service area ──
def test_service_area_calgary_fsa_allowed():
    ok, region = check_service_area(DEFAULT_SERVICE_AREA, postal="T2X 1A1")
    assert ok and region == "Calgary"


def test_service_area_out_of_area():
    ok, _ = check_service_area(DEFAULT_SERVICE_AREA, postal="M5V 1A1", city="Toronto")
    assert ok is False


def test_service_area_city_fallback():
    ok, region = check_service_area(DEFAULT_SERVICE_AREA, postal="", city="calgary")
    assert ok and region == "Calgary"


def test_service_area_master_off_blocks_all():
    sa = {"master_enabled": False, "regions": DEFAULT_SERVICE_AREA["regions"]}
    ok, _ = check_service_area(sa, postal="T2X 1A1")
    assert ok is False


def test_service_area_disabled_region_blocked():
    sa = {"master_enabled": True, "regions": [{"name": "Calgary", "enabled": False, "fsa_prefixes": ["T2"]}]}
    ok, _ = check_service_area(sa, postal="T2X 1A1")
    assert ok is False


# ── availability window ──
def test_window_lead_and_horizon_and_hours():
    slots = generate_candidate_slots(cfg(lead_days=3, horizon_days=7), NOW)
    days = sorted({s.date() for s in slots})
    assert days[0] == date(2026, 7, 2)   # now + 3
    assert days[-1] == date(2026, 7, 6)  # now + 7
    hours = sorted({s.hour for s in slots})
    assert hours[0] == 8 and hours[-1] == 21
    assert len([s for s in slots if s.date() == days[0]]) == 14  # 08:00..21:00


def test_working_weekdays_filter():
    # Only Mondays open (weekday 0). 2026-07-06 is the only Monday in the window.
    slots = generate_candidate_slots(cfg(working_weekdays=[0]), NOW)
    days = sorted({s.date() for s in slots})
    assert days == [date(2026, 7, 6)]


# ── capacity (the no-oversell decision) ──
def test_capacity_full_removes_slot():
    c = cfg(default_capacity=1)
    target = generate_candidate_slots(c, NOW)[0]
    assert target not in available_slots(c, NOW, booked_counts={target: 1})
    # capacity 2: still open with 1 booked
    c2 = cfg(default_capacity=2)
    assert target in available_slots(c2, NOW, booked_counts={target: 1})


def test_override_closes_slot_and_day():
    c = cfg()
    target = generate_candidate_slots(c, NOW)[0]
    assert target not in available_slots(c, NOW, overrides={(target.date(), target.hour): 0})
    day_closed = available_slots(c, NOW, overrides={(target.date(), None): 0})
    assert not any(s.date() == target.date() for s in day_closed)


def test_override_can_add_capacity():
    c = cfg(default_capacity=1)
    target = generate_candidate_slots(c, NOW)[0]
    # default would be full at 1 booking, but a per-slot override of 2 keeps it open
    out = available_slots(c, NOW, overrides={(target.date(), target.hour): 2}, booked_counts={target: 1})
    assert target in out


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"  ok  {fn.__name__}")
    print(f"\nAll {len(fns)} booking-logic unit tests passed.")
