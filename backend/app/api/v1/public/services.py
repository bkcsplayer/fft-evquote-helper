"""Public, token-scoped endpoints for the v3.0 services (diagnostic / bird-netting / cleaning):
service pricing, shared-pool slots, booking submission + status, bird-netting quote view/approve,
and cleaning subscription submission + status. No account — secure-token access (like EV cases).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    BirdNettingQuote,
    CleaningSubscription,
    CleaningVisit,
    ServiceBooking,
    ServiceType,
)
from app.services import service_booking_flow as flow
from app.services.availability import list_available_slots
from app.services.booking_config import get_booking_config
from app.services.service_pricing import get_service_pricing

router = APIRouter()

SERVICE_UPLOAD_DIR = Path("uploads") / "services"


# ── pricing & slots ──
@router.get("/public/service-pricing")
def public_service_pricing(db: Session = Depends(get_db)):
    return get_service_pricing(db)


@router.get("/public/services/slots")
def public_service_slots(db: Session = Depends(get_db)):
    """Shared-pool availability (kind-agnostic) for the three new services."""
    slots = list_available_slots(db, get_booking_config(db))
    return {"slots": [s.isoformat() for s in slots]}


@router.post("/public/services/upload")
async def public_service_upload(file: UploadFile = File(...), db: Session = Depends(get_db)):
    _ = db
    ext = (Path(file.filename or "").suffix or "").lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Photo must be a PNG/JPG/WEBP/GIF image")
    SERVICE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    dest = SERVICE_UPLOAD_DIR / name
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 25MB).")
    dest.write_bytes(data)
    return {"url": f"/uploads/services/{name}"}


# ── diagnostic / bird-netting booking ──
class BookingIn(BaseModel):
    service_type: str
    customer_name: str
    phone: str
    email: str
    address: str
    panel_count: int = 0
    start_at: datetime
    disclaimer_accepted: bool
    preferred_window: str | None = None
    inverter_info: str | None = None
    problem_description: str | None = None
    problem_tags: list | None = None
    photo_urls: list | None = None


def _parse_service_type(v: str) -> ServiceType:
    try:
        return ServiceType(v)
    except ValueError:
        raise HTTPException(status_code=400, detail="service_type must be 'diagnostic' or 'bird_netting'")


def _booking_public_view(db: Session, b: ServiceBooking) -> dict:
    quote = db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == b.id)
    ).scalar_one_or_none()
    return {
        "reference_number": b.reference_number,
        "service_type": b.service_type.value,
        "status": b.status.value,
        "customer_name": b.customer_name,
        "address": b.address,
        "panel_count": b.panel_count,
        "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
        "technician": b.technician,
        "completed_at": b.completed_at.isoformat() if b.completed_at else None,
        "quote": (
            {
                "roll_count": quote.roll_count,
                "nest_count": quote.nest_count,
                "total": float(quote.total),
                "status": quote.status.value,
            }
            if quote
            else None
        ),
    }


@router.post("/public/services/bookings")
def submit_booking(payload: BookingIn, db: Session = Depends(get_db)):
    if not payload.disclaimer_accepted:
        raise HTTPException(status_code=400, detail="You must accept the service terms & disclaimer.")
    service_type = _parse_service_type(payload.service_type)
    booking = flow.create_service_booking(
        db,
        service_type=service_type,
        customer_name=payload.customer_name.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip(),
        address=payload.address.strip(),
        panel_count=payload.panel_count or 0,
        start_at=payload.start_at,
        disclaimer_accepted_at=datetime.now().astimezone(),
        preferred_window=payload.preferred_window,
        inverter_info=payload.inverter_info,
        problem_description=payload.problem_description,
        problem_tags=payload.problem_tags,
        photo_urls=payload.photo_urls,
    )
    return {
        "token": booking.access_token,
        "reference": booking.reference_number,
        "status": booking.status.value,
    }


def _get_booking(db: Session, token: str) -> ServiceBooking:
    b = db.execute(
        select(ServiceBooking).where(ServiceBooking.access_token == token)
    ).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Invalid token")
    return b


@router.get("/public/services/bookings/{token}")
def get_booking_status(token: str, db: Session = Depends(get_db)):
    return _booking_public_view(db, _get_booking(db, token))


@router.post("/public/services/bookings/{token}/cancel")
def cancel_booking(token: str, db: Session = Depends(get_db)):
    flow.cancel_booking(db, booking=_get_booking(db, token))
    return {"ok": True}


# ── bird-netting quote view + approve ──
@router.get("/public/services/bird-netting/quote/{token}")
def get_bird_quote(token: str, db: Session = Depends(get_db)):
    b = _get_booking(db, token)
    if b.service_type != ServiceType.bird_netting:
        raise HTTPException(status_code=404, detail="No bird-netting quote for this booking")
    quote = db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == b.id)
    ).scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="No quote yet")
    return {
        "reference_number": b.reference_number,
        "customer_name": b.customer_name,
        "address": b.address,
        "roll_count": quote.roll_count,
        "nest_count": quote.nest_count,
        "roll_price": float(quote.roll_price_snapshot),
        "nest_fee": float(quote.nest_fee_snapshot),
        "total": float(quote.total),
        "status": quote.status.value,
        "approved_at": quote.approved_at.isoformat() if quote.approved_at else None,
    }


class ApproveIn(BaseModel):
    signature_data: str
    signed_name: str


@router.post("/public/services/bird-netting/quote/{token}/approve")
def approve_bird_quote(token: str, payload: ApproveIn, db: Session = Depends(get_db)):
    b = _get_booking(db, token)
    if b.service_type != ServiceType.bird_netting:
        raise HTTPException(status_code=404, detail="No bird-netting quote for this booking")
    if not payload.signature_data or not payload.signed_name.strip():
        raise HTTPException(status_code=400, detail="Signature and name are required.")
    flow.approve_bird_quote(
        db, booking=b, signature_data=payload.signature_data, signed_name=payload.signed_name.strip()
    )
    return {"ok": True, "status": "approved"}


# ── cleaning subscription ──
class CleaningIn(BaseModel):
    customer_name: str
    phone: str
    email: str
    address: str
    panel_count: int = Field(gt=0, description="Number of panels must be greater than 0")
    start_date: date | None = None
    disclaimer_accepted: bool


@router.post("/public/services/cleaning/subscriptions")
def submit_cleaning(payload: CleaningIn, db: Session = Depends(get_db)):
    if not payload.disclaimer_accepted:
        raise HTTPException(status_code=400, detail="You must accept the service terms & disclaimer.")
    sub = flow.create_cleaning_subscription(
        db,
        customer_name=payload.customer_name.strip(),
        phone=payload.phone.strip(),
        email=payload.email.strip(),
        address=payload.address.strip(),
        panel_count=payload.panel_count,
        start_date=payload.start_date or date.today(),
        disclaimer_accepted_at=datetime.now().astimezone(),
    )
    return {
        "token": sub.access_token,
        "reference": sub.reference_number,
        "tier": sub.tier.value,
        "annual_price": float(sub.annual_price) if sub.annual_price is not None else None,
        "pricing_status": sub.pricing_status.value,
    }


def _cleaning_public_view(db: Session, sub: CleaningSubscription) -> dict:
    visits = db.execute(
        select(CleaningVisit).where(CleaningVisit.subscription_id == sub.id).order_by(CleaningVisit.quarter.asc())
    ).scalars().all()
    return {
        "reference_number": sub.reference_number,
        "customer_name": sub.customer_name,
        "address": sub.address,
        "panel_count": sub.panel_count,
        "tier": sub.tier.value,
        "annual_price": float(sub.annual_price) if sub.annual_price is not None else None,
        "pricing_status": sub.pricing_status.value,
        "payment_status": sub.payment_status.value,
        "start_date": sub.start_date.isoformat(),
        "visits": [
            {
                "quarter": v.quarter,
                "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
                "status": v.status.value,
            }
            for v in visits
        ],
    }


@router.get("/public/services/cleaning/{token}")
def get_cleaning_status(token: str, db: Session = Depends(get_db)):
    sub = db.execute(
        select(CleaningSubscription).where(CleaningSubscription.access_token == token)
    ).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Invalid token")
    return _cleaning_public_view(db, sub)
