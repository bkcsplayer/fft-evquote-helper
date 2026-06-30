"""Public, token-scoped booking endpoints (customer app): service-area check, waitlist,
available slots, book, and cancel. Replaces the survey/install propose->confirm handshake.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import AppointmentKind, Case, Waitlist
from app.services import booking_flow
from app.services.availability import list_available_slots
from app.services.booking_config import get_booking_config, get_service_area
from app.services.service_area import check_service_area

router = APIRouter()


def _get_case(db: Session, token: str) -> Case:
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")
    return case


def _parse_kind(kind: str) -> AppointmentKind:
    try:
        return AppointmentKind(kind)
    except ValueError:
        raise HTTPException(status_code=400, detail="kind must be 'survey' or 'install'")


@router.get("/service-area/check")
def service_area_check(postal: str | None = None, city: str | None = None, db: Session = Depends(get_db)):
    allowed, region = check_service_area(get_service_area(db), postal=postal, city=city)
    return {"allowed": allowed, "region": region}


class WaitlistIn(BaseModel):
    email: str | None = None
    phone: str | None = None
    postal: str | None = None
    city: str | None = None


@router.post("/waitlist")
def join_waitlist(payload: WaitlistIn, db: Session = Depends(get_db)):
    db.add(Waitlist(email=payload.email, phone=payload.phone, postal=payload.postal, city=payload.city))
    db.commit()
    return {"ok": True}


@router.get("/cases/{token}/slots")
def get_slots(token: str, kind: str = Query(...), db: Session = Depends(get_db)):
    _get_case(db, token)
    slots = list_available_slots(db, get_booking_config(db), _parse_kind(kind))
    return {"slots": [s.isoformat() for s in slots]}


class BookIn(BaseModel):
    kind: str
    start_at: datetime


@router.post("/cases/{token}/book")
def book(token: str, payload: BookIn, db: Session = Depends(get_db)):
    case = _get_case(db, token)
    appt = booking_flow.book(db, case=case, kind=_parse_kind(payload.kind), start_at=payload.start_at, created_by="customer")
    return {"ok": True, "start_at": appt.start_at.isoformat()}


class CancelIn(BaseModel):
    kind: str


@router.post("/cases/{token}/cancel-booking")
def cancel_booking(token: str, payload: CancelIn, db: Session = Depends(get_db)):
    case = _get_case(db, token)
    booking_flow.cancel(db, case=case, kind=_parse_kind(payload.kind))
    return {"ok": True}
