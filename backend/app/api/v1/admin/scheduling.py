"""Admin Scheduling: booking config, service-area, per-day capacity overrides, and the
all-bookings list (with cancel / admin re-book). Backs the new admin Scheduling page.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import (
    Appointment,
    AppointmentKind,
    AppointmentStatus,
    AvailabilityOverride,
    AdminUser,
    Case,
    Customer,
    SystemSetting,
)
from app.services import booking_flow
from app.services.booking_config import (
    BOOKING_CONFIG_KEY,
    SERVICE_AREA_KEY,
    get_booking_config,
    get_service_area,
)

router = APIRouter(prefix="/admin")


def _upsert_setting(db: Session, key: str, value: dict) -> None:
    row = db.execute(select(SystemSetting).where(SystemSetting.key == key)).scalar_one_or_none()
    if not row:
        db.add(SystemSetting(key=key, value=dict(value)))
    else:
        row.value = dict(value)  # new object so JSONB change tracking fires
        db.add(row)
    db.commit()


# ── booking config & service area ──
class SettingBody(BaseModel):
    value: dict


@router.get("/booking-config")
def read_booking_config(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    return get_booking_config(db)


@router.put("/booking-config")
def write_booking_config(body: SettingBody, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    _upsert_setting(db, BOOKING_CONFIG_KEY, body.value)
    return get_booking_config(db)


@router.get("/service-area")
def read_service_area(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    return get_service_area(db)


@router.put("/service-area")
def write_service_area(body: SettingBody, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    _upsert_setting(db, SERVICE_AREA_KEY, body.value)
    return get_service_area(db)


# ── per-day / per-slot capacity overrides ──
class OverrideIn(BaseModel):
    day: date
    hour: int | None = None
    capacity: int


@router.get("/availability-overrides")
def list_overrides(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    rows = db.execute(select(AvailabilityOverride).order_by(AvailabilityOverride.day.asc())).scalars().all()
    return [{"id": str(r.id), "day": r.day.isoformat(), "hour": r.hour, "capacity": r.capacity} for r in rows]


@router.post("/availability-overrides")
def upsert_override(payload: OverrideIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    row = db.execute(
        select(AvailabilityOverride).where(
            AvailabilityOverride.day == payload.day, AvailabilityOverride.hour == payload.hour
        )
    ).scalar_one_or_none()
    if row:
        row.capacity = payload.capacity
    else:
        row = AvailabilityOverride(day=payload.day, hour=payload.hour, capacity=payload.capacity)
        db.add(row)
    db.commit()
    return {"id": str(row.id), "day": row.day.isoformat(), "hour": row.hour, "capacity": row.capacity}


@router.delete("/availability-overrides/{override_id}")
def delete_override(override_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    row = db.get(AvailabilityOverride, override_id)
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


# ── bookings list + cancel + admin re-book ──
@router.get("/bookings")
def list_bookings(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    now = datetime.now(timezone.utc)
    rows = db.execute(
        select(Appointment)
        .where(Appointment.status == AppointmentStatus.booked, Appointment.start_at >= now)
        .order_by(Appointment.start_at.asc())
    ).scalars().all()
    out = []
    for a in rows:
        case = db.get(Case, a.case_id)
        customer = db.get(Customer, case.customer_id) if case else None
        out.append({
            "id": str(a.id),
            "case_id": str(a.case_id),
            "reference_number": getattr(case, "reference_number", None),
            "customer": customer.nickname if customer else None,
            "kind": a.kind.value,
            "start_at": a.start_at.isoformat(),
        })
    return out


@router.post("/bookings/{appointment_id}/cancel")
def cancel_booking(appointment_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    appt = db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    case = db.get(Case, appt.case_id)
    booking_flow.cancel(db, case=case, kind=appt.kind)
    return {"ok": True}


class AdminBookIn(BaseModel):
    kind: str
    start_at: datetime


@router.post("/cases/{case_id}/book")
def admin_book(case_id: str, payload: AdminBookIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    try:
        kind = AppointmentKind(payload.kind)
    except ValueError:
        raise HTTPException(status_code=400, detail="kind must be 'survey' or 'install'")
    appt = booking_flow.book(db, case=case, kind=kind, start_at=payload.start_at, created_by="admin")
    return {"ok": True, "start_at": appt.start_at.isoformat()}
