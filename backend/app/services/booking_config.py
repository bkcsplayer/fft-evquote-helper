"""Booking configuration & service-area config, stored as SystemSetting rows with safe defaults.

A single source the admin Scheduling page edits; defaults apply until overridden so the system
works before anything is configured.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import SystemSetting

BOOKING_CONFIG_KEY = "booking_config"
SERVICE_AREA_KEY = "service_area"

DEFAULT_BOOKING_CONFIG: dict[str, Any] = {
    "slot_minutes": 60,
    "day_start_hour": 8,          # first slot starts 08:00
    "day_end_hour": 22,           # last slot starts 21:00 (ends 22:00)
    "default_capacity": 1,        # one booking per slot by default
    "lead_days": 3,               # earliest bookable = now + 3 days
    "horizon_days": 7,            # latest bookable = now + 7 days
    "working_weekdays": [0, 1, 2, 3, 4, 5, 6],  # Mon=0 .. Sun=6 (all days open)
    "timezone": "America/Edmonton",
    "reschedule_cutoff_hours": 24,
}

DEFAULT_SERVICE_AREA: dict[str, Any] = {
    "master_enabled": True,
    "regions": [
        {"name": "Calgary", "enabled": True, "fsa_prefixes": ["T1Y", "T2", "T3"], "cities": ["Calgary"]},
    ],
}


def _get_setting(db: Session, key: str) -> dict | None:
    row = db.execute(select(SystemSetting).where(SystemSetting.key == key)).scalar_one_or_none()
    return row.value if row and isinstance(row.value, dict) else None


def get_booking_config(db: Session) -> dict[str, Any]:
    return {**DEFAULT_BOOKING_CONFIG, **(_get_setting(db, BOOKING_CONFIG_KEY) or {})}


def get_service_area(db: Session) -> dict[str, Any]:
    return _get_setting(db, SERVICE_AREA_KEY) or DEFAULT_SERVICE_AREA
