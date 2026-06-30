"""Slot availability.

Pure core (`generate_candidate_slots` / `available_slots`) is unit-tested with no DB.
`list_available_slots` is the DB-backed wrapper that gathers overrides + existing bookings.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Appointment, AppointmentKind, AppointmentStatus, AvailabilityOverride


def _tz(config: dict[str, Any]) -> ZoneInfo:
    return ZoneInfo(config.get("timezone", "America/Edmonton"))


def generate_candidate_slots(config: dict[str, Any], now_local: datetime) -> list[datetime]:
    """All slot-start datetimes within [now+lead, now+horizon] on working days/hours. Pure."""
    start_hour = int(config["day_start_hour"])
    end_hour = int(config["day_end_hour"])  # exclusive: last slot starts end_hour-1
    lead_days = int(config["lead_days"])
    horizon_days = int(config["horizon_days"])
    working = set(config.get("working_weekdays", [0, 1, 2, 3, 4, 5, 6]))

    first_day = (now_local + timedelta(days=lead_days)).date()
    last_day = (now_local + timedelta(days=horizon_days)).date()

    slots: list[datetime] = []
    d = first_day
    while d <= last_day:
        if d.weekday() in working:
            for h in range(start_hour, end_hour):
                slots.append(datetime.combine(d, time(hour=h), tzinfo=now_local.tzinfo))
        d += timedelta(days=1)
    return slots


def available_slots(
    config: dict[str, Any],
    now_local: datetime,
    *,
    overrides: dict | None = None,
    booked_counts: dict | None = None,
) -> list[datetime]:
    """Filter candidate slots by capacity. Pure.

    overrides: {(date, hour): capacity, (date, None): capacity}  (0 = closed)
    booked_counts: {slot_start_datetime: int}
    """
    overrides = overrides or {}
    booked_counts = booked_counts or {}
    default_cap = int(config["default_capacity"])

    out: list[datetime] = []
    for s in generate_candidate_slots(config, now_local):
        cap = default_cap
        if (s.date(), None) in overrides:
            cap = overrides[(s.date(), None)]
        if (s.date(), s.hour) in overrides:
            cap = overrides[(s.date(), s.hour)]
        if cap <= 0:
            continue
        if booked_counts.get(s, 0) >= cap:
            continue
        out.append(s)
    return out


def list_available_slots(db: Session, config: dict[str, Any], kind: AppointmentKind) -> list[datetime]:
    """DB-backed: available slot-starts for a booking kind, in the configured window/timezone."""
    tz = _tz(config)
    now_local = datetime.now(tz)
    cand = generate_candidate_slots(config, now_local)
    if not cand:
        return []
    window_start, window_end = cand[0], cand[-1]

    overrides: dict = {}
    rows = db.execute(
        select(AvailabilityOverride).where(
            AvailabilityOverride.day >= window_start.date(),
            AvailabilityOverride.day <= window_end.date(),
        )
    ).scalars().all()
    for r in rows:
        overrides[(r.day, r.hour)] = r.capacity

    booked_counts: dict = {}
    appts = db.execute(
        select(Appointment.start_at).where(
            Appointment.kind == kind,
            Appointment.status == AppointmentStatus.booked,
            Appointment.start_at >= window_start,
            Appointment.start_at <= window_end,
        )
    ).scalars().all()
    for sa in appts:
        s_local = sa.astimezone(tz)
        booked_counts[s_local] = booked_counts.get(s_local, 0) + 1

    return available_slots(config, now_local, overrides=overrides, booked_counts=booked_counts)
