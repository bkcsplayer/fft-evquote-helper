"""Customer-facing time formatting in Calgary local time (ADR-018).

Explicit America/Edmonton — never rely on the container TZ (bare astimezone()).
No tz abbreviation (ADR-021): Alberta is permanent UTC-6 from 2026-11-01 and tzdata calls
that "CST", which customers read as US Central — we say "(Calgary time)" instead.
"""

from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

CALGARY_TZ = ZoneInfo("America/Edmonton")


def to_calgary(dt: datetime) -> datetime:
    """Naive datetimes are treated as UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(CALGARY_TZ)


def fmt_calgary(dt: datetime) -> str:
    """"Fri, Oct 9, 8:00 AM (Calgary time)" (no %-d / %-I: unsupported on Windows)."""
    d = to_calgary(dt)
    return f"{d:%a}, {d:%b} {d.day}, {d.hour % 12 or 12}:{d:%M} {d:%p} (Calgary time)"


def calgary_date_iso(dt: datetime) -> str:
    return to_calgary(dt).date().isoformat()
