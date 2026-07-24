"""Slot booking with atomic no-oversell guarantee.

Capacity is a COMPANY-WIDE SHARED POOL per (day, hour): EV survey/install AND the three v3.0
services (diagnostic / bird survey+install / cleaning) all draw from the same hourly quota.
The count is therefore kind-agnostic.

`book_slot` must run inside a request transaction. It locks the existing bookings for the target
slot with SELECT ... FOR UPDATE, re-counts under the lock (all kinds), and only then inserts — so
two concurrent callers cannot both grab the last seat (the second blocks until the first commits,
then sees the new row and is rejected). v3.0: each appointment consumes exactly 1 unit.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Appointment, AppointmentKind, AppointmentStatus, AvailabilityOverride


class SlotUnavailable(Exception):
    """Raised when a slot is closed or already at capacity."""


def capacity_for(db: Session, config: dict[str, Any], day, hour: int) -> int:
    """Effective capacity for a day/hour: per-slot override > whole-day override > default."""
    default_cap = int(config["default_capacity"])
    cap = default_cap
    rows = db.execute(
        select(AvailabilityOverride).where(AvailabilityOverride.day == day)
    ).scalars().all()
    for r in rows:
        if r.hour is None:
            cap = r.capacity
    for r in rows:
        if r.hour == hour:
            cap = r.capacity
    return cap


def book_slot(
    db: Session,
    *,
    kind: AppointmentKind,
    start_at: datetime,
    config: dict[str, Any],
    created_by: str = "customer",
    case_id=None,
    service_booking_id=None,
    cleaning_visit_id=None,
) -> Appointment:
    """Atomically book a slot against the shared capacity pool. Raises SlotUnavailable if
    closed/full. Caller commits. Exactly one target FK (case / service_booking / cleaning_visit)
    must be provided; `kind` labels the appointment but does NOT scope the capacity count.
    """
    cap = capacity_for(db, config, start_at.date(), start_at.hour)
    if cap <= 0:
        raise SlotUnavailable("This time is not available.")

    # Shared pool: lock ALL active bookings for this exact slot (any kind/service), then re-count.
    existing = db.execute(
        select(Appointment)
        .where(
            Appointment.start_at == start_at,
            Appointment.status == AppointmentStatus.booked,
        )
        .with_for_update()
    ).scalars().all()
    if len(existing) >= cap:
        raise SlotUnavailable("This time was just taken. Please pick another.")

    appt = Appointment(
        case_id=case_id,
        service_booking_id=service_booking_id,
        cleaning_visit_id=cleaning_visit_id,
        kind=kind,
        start_at=start_at,
        status=AppointmentStatus.booked,
        created_by=created_by,
    )
    db.add(appt)
    db.flush()
    return appt


def cancel_appointment(db: Session, appt: Appointment) -> None:
    appt.status = AppointmentStatus.cancelled
    db.flush()


def reschedule(
    db: Session,
    *,
    appt: Appointment,
    new_start_at: datetime,
    config: dict[str, Any],
    created_by: str = "customer",
) -> Appointment:
    """Cancel the existing booking and atomically book the new slot (same no-oversell path)."""
    cancel_appointment(db, appt)
    return book_slot(
        db,
        case_id=appt.case_id,
        service_booking_id=appt.service_booking_id,
        cleaning_visit_id=appt.cleaning_visit_id,
        kind=appt.kind,
        start_at=new_start_at,
        config=config,
        created_by=created_by,
    )
