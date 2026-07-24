"""Admin endpoints for the v3.0 services: service-booking list/detail/actions (diagnostic +
bird-netting), cleaning subscription/visit management, the unified four-service schedule
(aggregated from the generalized Appointment table + cleaning_visits), service pricing, and a
services dashboard. EV data is read-only aggregate in the unified schedule; never mutated here.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import (
    AdminUser,
    Appointment,
    AppointmentStatus,
    BirdNettingQuote,
    Case,
    CleaningPaymentStatus,
    CleaningSubscription,
    CleaningVisit,
    CleaningVisitStatus,
    Customer,
    ServiceBooking,
    ServiceBookingStatus,
    ServiceType,
)
from app.services import service_booking_flow as flow
from app.services.service_pricing import get_service_pricing

router = APIRouter(prefix="/admin")


# ── service classification for the unified schedule ──
_KIND_SERVICE = {
    "survey": "ev",
    "install": "ev",
    "diagnostic": "diagnostic",
    "bird_survey": "bird_netting",
    "bird_install": "bird_netting",
    "cleaning": "cleaning",
}


def _booking_admin_view(db: Session, b: ServiceBooking) -> dict:
    quote = db.execute(
        select(BirdNettingQuote).where(BirdNettingQuote.booking_id == b.id)
    ).scalar_one_or_none()
    return {
        "id": str(b.id),
        "reference_number": b.reference_number,
        "service_type": b.service_type.value,
        "status": b.status.value,
        "customer_name": b.customer_name,
        "phone": b.phone,
        "email": b.email,
        "address": b.address,
        "panel_count": b.panel_count,
        "preferred_window": b.preferred_window,
        "inverter_info": b.inverter_info,
        "problem_description": b.problem_description,
        "problem_tags": b.problem_tags,
        "photo_urls": b.photo_urls or [],
        "technician": b.technician,
        "scheduled_at": b.scheduled_at.isoformat() if b.scheduled_at else None,
        "completed_at": b.completed_at.isoformat() if b.completed_at else None,
        "actual_hours": float(b.actual_hours) if b.actual_hours is not None else None,
        "hardware_involved": b.hardware_involved,
        "completion_notes": b.completion_notes,
        "hourly_rate_snapshot": float(b.hourly_rate_snapshot) if b.hourly_rate_snapshot is not None else None,
        "access_token": b.access_token,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "quote": (
            {
                "roll_count": quote.roll_count,
                "nest_count": quote.nest_count,
                "roll_price": float(quote.roll_price_snapshot),
                "nest_fee": float(quote.nest_fee_snapshot),
                "total": float(quote.total),
                "status": quote.status.value,
                "signed_name": quote.signed_name,
                "approved_at": quote.approved_at.isoformat() if quote.approved_at else None,
            }
            if quote
            else None
        ),
    }


# ── service bookings ──
@router.get("/services/bookings")
def list_bookings(
    type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = select(ServiceBooking).order_by(ServiceBooking.created_at.desc())
    if type:
        try:
            stmt = stmt.where(ServiceBooking.service_type == ServiceType(type))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid service type")
    if status:
        try:
            stmt = stmt.where(ServiceBooking.status == ServiceBookingStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid status")
    rows = db.execute(stmt).scalars().all()
    return [_booking_admin_view(db, b) for b in rows]


def _get_booking(db: Session, booking_id: str) -> ServiceBooking:
    b = db.get(ServiceBooking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


@router.get("/services/bookings/{booking_id}")
def get_booking(booking_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    return _booking_admin_view(db, _get_booking(db, booking_id))


class ScheduleIn(BaseModel):
    start_at: datetime
    technician: str | None = None


@router.post("/services/bookings/{booking_id}/schedule")
def schedule_booking(booking_id: str, payload: ScheduleIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    b = flow.admin_schedule_booking(db, booking=_get_booking(db, booking_id), start_at=payload.start_at, technician=payload.technician)
    return _booking_admin_view(db, b)


class StatusIn(BaseModel):
    status: str
    actual_hours: float | None = None
    hardware_involved: bool | None = None
    completion_notes: str | None = None


@router.post("/services/bookings/{booking_id}/status")
def update_booking_status(booking_id: str, payload: StatusIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    try:
        new_status = ServiceBookingStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")
    b = flow.admin_update_status(
        db,
        booking=_get_booking(db, booking_id),
        new_status=new_status,
        actual_hours=payload.actual_hours,
        hardware_involved=payload.hardware_involved,
        completion_notes=payload.completion_notes,
    )
    return _booking_admin_view(db, b)


class QuoteIn(BaseModel):
    roll_count: int
    nest_count: int = 0


@router.post("/services/bookings/{booking_id}/quote")
def create_quote(booking_id: str, payload: QuoteIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    flow.admin_create_bird_quote(db, booking=_get_booking(db, booking_id), roll_count=payload.roll_count, nest_count=payload.nest_count)
    return _booking_admin_view(db, _get_booking(db, booking_id))


@router.post("/services/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    b = flow.cancel_booking(db, booking=_get_booking(db, booking_id))
    return _booking_admin_view(db, b)


# ── cleaning subscriptions ──
def _cleaning_admin_view(db: Session, sub: CleaningSubscription) -> dict:
    visits = db.execute(
        select(CleaningVisit).where(CleaningVisit.subscription_id == sub.id).order_by(CleaningVisit.quarter.asc())
    ).scalars().all()
    return {
        "id": str(sub.id),
        "reference_number": sub.reference_number,
        "customer_name": sub.customer_name,
        "phone": sub.phone,
        "email": sub.email,
        "address": sub.address,
        "panel_count": sub.panel_count,
        "tier": sub.tier.value,
        "annual_price": float(sub.annual_price) if sub.annual_price is not None else None,
        "pricing_status": sub.pricing_status.value,
        "payment_status": sub.payment_status.value,
        "start_date": sub.start_date.isoformat(),
        "access_token": sub.access_token,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "visits": [
            {
                "id": str(v.id),
                "quarter": v.quarter,
                "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
                "status": v.status.value,
                "completed_at": v.completed_at.isoformat() if v.completed_at else None,
                "notes": v.notes,
            }
            for v in visits
        ],
    }


@router.get("/services/cleaning")
def list_cleaning(
    payment_status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = select(CleaningSubscription).order_by(CleaningSubscription.created_at.desc())
    if payment_status:
        try:
            stmt = stmt.where(CleaningSubscription.payment_status == CleaningPaymentStatus(payment_status))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payment status")
    rows = db.execute(stmt).scalars().all()
    return [_cleaning_admin_view(db, s) for s in rows]


def _get_sub(db: Session, sub_id: str) -> CleaningSubscription:
    s = db.get(CleaningSubscription, sub_id)
    if not s:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return s


@router.get("/services/cleaning/{sub_id}")
def get_cleaning(sub_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    return _cleaning_admin_view(db, _get_sub(db, sub_id))


class PriceIn(BaseModel):
    annual_price: float


@router.post("/services/cleaning/{sub_id}/price")
def set_cleaning_price(sub_id: str, payload: PriceIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    s = flow.admin_set_cleaning_price(db, sub=_get_sub(db, sub_id), annual_price=payload.annual_price)
    return _cleaning_admin_view(db, s)


class PaymentIn(BaseModel):
    payment_status: str


@router.post("/services/cleaning/{sub_id}/payment")
def set_cleaning_payment(sub_id: str, payload: PaymentIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    try:
        ps = CleaningPaymentStatus(payload.payment_status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payment status")
    s = flow.admin_set_cleaning_payment(db, sub=_get_sub(db, sub_id), payment_status=ps)
    return _cleaning_admin_view(db, s)


class VisitScheduleIn(BaseModel):
    start_at: datetime


@router.post("/services/cleaning/visits/{visit_id}/schedule")
def schedule_visit(visit_id: str, payload: VisitScheduleIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    visit = db.get(CleaningVisit, visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    flow.admin_schedule_visit(db, visit=visit, start_at=payload.start_at)
    return _cleaning_admin_view(db, _get_sub(db, str(visit.subscription_id)))


class VisitStatusIn(BaseModel):
    status: str
    notes: str | None = None


@router.post("/services/cleaning/visits/{visit_id}/status")
def update_visit_status(visit_id: str, payload: VisitStatusIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    visit = db.get(CleaningVisit, visit_id)
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    try:
        st = CleaningVisitStatus(payload.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid visit status")
    flow.admin_update_visit_status(db, visit=visit, status=st, notes=payload.notes)
    return _cleaning_admin_view(db, _get_sub(db, str(visit.subscription_id)))


# ── unified schedule (four services, read from generalized Appointment + cleaning_visits) ──
@router.get("/services/schedule")
def unified_schedule(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = select(Appointment).where(Appointment.status == AppointmentStatus.booked)
    if from_:
        stmt = stmt.where(Appointment.start_at >= from_)
    if to:
        stmt = stmt.where(Appointment.start_at <= to)
    stmt = stmt.order_by(Appointment.start_at.asc())
    rows = db.execute(stmt).scalars().all()

    out = []
    for a in rows:
        service = _KIND_SERVICE.get(a.kind.value, "other")
        title = ""
        ref = None
        link = None
        if a.case_id:
            case = db.get(Case, a.case_id)
            cust = db.get(Customer, case.customer_id) if case else None
            title = cust.nickname if cust else "EV case"
            ref = getattr(case, "reference_number", None)
            link = f"/admin/cases/{a.case_id}"
        elif a.service_booking_id:
            b = db.get(ServiceBooking, a.service_booking_id)
            title = b.customer_name if b else "Service"
            ref = getattr(b, "reference_number", None)
            link = f"/admin/services/bookings/{a.service_booking_id}"
        elif a.cleaning_visit_id:
            v = db.get(CleaningVisit, a.cleaning_visit_id)
            sub = db.get(CleaningSubscription, v.subscription_id) if v else None
            title = f"{sub.customer_name} (Q{v.quarter})" if sub and v else "Cleaning"
            ref = getattr(sub, "reference_number", None)
            link = "/admin/services/cleaning"
        out.append(
            {
                "id": str(a.id),
                "kind": a.kind.value,
                "service": service,
                "start_at": a.start_at.isoformat(),
                "title": title,
                "ref": ref,
                "link": link,
            }
        )
    return out


# ── pricing convenience read ──
@router.get("/services/pricing")
def read_pricing(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    return get_service_pricing(db)


# ── services dashboard KPIs ──
@router.get("/services/dashboard")
def services_dashboard(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    bookings_this_month = db.execute(
        select(ServiceBooking).where(ServiceBooking.created_at >= month_start)
    ).scalars().all()
    subs = db.execute(select(CleaningSubscription)).scalars().all()
    pending_bird_quotes = db.execute(
        select(ServiceBooking).where(
            ServiceBooking.service_type == ServiceType.bird_netting,
            ServiceBooking.status == ServiceBookingStatus.quoted,
        )
    ).scalars().all()

    # per-service revenue this month (best-effort snapshot math)
    diag_rev = 0.0
    diag_count = 0
    bird_rev = 0.0
    bird_count = 0
    for b in db.execute(select(ServiceBooking)).scalars().all():
        if b.service_type == ServiceType.diagnostic:
            if b.completed_at and b.completed_at >= month_start:
                diag_count += 1
                if b.actual_hours and b.hourly_rate_snapshot:
                    diag_rev += float(b.actual_hours) * float(b.hourly_rate_snapshot)
        else:
            q = db.execute(select(BirdNettingQuote).where(BirdNettingQuote.booking_id == b.id)).scalar_one_or_none()
            if q and q.approved_at and q.approved_at >= month_start:
                bird_count += 1
                bird_rev += float(q.total)

    clean_rev = 0.0
    clean_count = 0
    for s in subs:
        if s.created_at and s.created_at >= month_start:
            clean_count += 1
            if s.annual_price is not None:
                clean_rev += float(s.annual_price)

    return {
        "combined": {
            "new_bookings_this_month": len(bookings_this_month),
            "active_cleaning_subscriptions": len(subs),
            "pending_bird_quotes": len(pending_bird_quotes),
        },
        "per_service": {
            "diagnostic": {"count_this_month": diag_count, "revenue_this_month": round(diag_rev, 2)},
            "bird_netting": {"count_this_month": bird_count, "revenue_this_month": round(bird_rev, 2)},
            "cleaning": {"count_this_month": clean_count, "revenue_this_month": round(clean_rev, 2)},
        },
    }
