"""Booking flow: book/cancel a survey or installation slot for a case.

Wraps the atomic slot booking (no oversell) and mirrors the result into the existing
Survey/Installation rows + case status + history, so the rest of the system and the admin UI
see a booking exactly as if it had been scheduled. Notifications are best-effort and never block
a booking. Replaces the old propose->confirm/reject handshake.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.models import (
    Appointment,
    AppointmentKind,
    AppointmentStatus,
    Case,
    CaseStatus,
    CaseStatusHistory,
    Customer,
    Installation,
    Survey,
)
from app.services import booking as booking_svc
from app.services.availability import list_available_slots
from app.services.booking_config import get_booking_config
from app.services.notification_service import notify_case_status_sms
from app.services.status_machine import assert_transition_allowed


def _status_url(case: Case) -> str:
    base = (get_settings().frontend_url or "").rstrip("/")
    return f"{base}/quote/status/{case.access_token}"


def _notify_booked(db: Session, case: Case, kind: AppointmentKind, start_at: datetime) -> None:
    try:
        customer = db.get(Customer, case.customer_id)
        if not customer or not customer.phone:
            return
        when = start_at.astimezone().strftime("%Y-%m-%d %H:%M %Z")
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=getattr(case, "reference_number", "") or "",
            status=case.status.value,
            status_url=_status_url(case),
            note=f"{kind.value.capitalize()} confirmed for {when}.",
        )
    except Exception:
        pass  # notifications never break a booking


def _active(db: Session, case: Case, kind: AppointmentKind) -> list[Appointment]:
    return db.execute(
        select(Appointment).where(
            Appointment.case_id == case.id,
            Appointment.kind == kind,
            Appointment.status == AppointmentStatus.booked,
        )
    ).scalars().all()


def book(db: Session, *, case: Case, kind: AppointmentKind, start_at: datetime, created_by: str = "customer") -> Appointment:
    config = get_booking_config(db)

    if kind == AppointmentKind.survey:
        if case.status not in {CaseStatus.pending, CaseStatus.survey_scheduled}:
            raise HTTPException(status_code=400, detail="Survey can only be booked before it is completed.")
    else:
        if case.status not in {CaseStatus.permit_approved, CaseStatus.installation_scheduled}:
            raise HTTPException(status_code=400, detail="Installation booking opens after the permit is approved.")

    # Defense: only allow a slot the availability rules actually offer (window/closed/capacity).
    if not any(s == start_at for s in list_available_slots(db, config, kind)):
        raise HTTPException(status_code=409, detail="That time is not available. Please pick another.")

    # One active appointment per kind: supersede any existing booking (reschedule).
    for a in _active(db, case, kind):
        a.status = AppointmentStatus.cancelled

    try:
        appt = booking_svc.book_slot(
            db, case_id=case.id, kind=kind, start_at=start_at, config=config, created_by=created_by
        )
    except booking_svc.SlotUnavailable as e:
        raise HTTPException(status_code=409, detail=str(e))

    if kind == AppointmentKind.survey:
        survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
        if not survey:
            survey = Survey(case_id=case.id)
            db.add(survey)
            db.flush()
        survey.scheduled_date = start_at
        survey.request_status = "accepted"
        if case.status == CaseStatus.pending:
            assert_transition_allowed(from_status=case.status, to_status=CaseStatus.survey_scheduled)
            frm = case.status.value
            case.status = CaseStatus.survey_scheduled
            db.add(CaseStatusHistory(case_id=case.id, from_status=frm, to_status=CaseStatus.survey_scheduled.value, changed_by=None, note="Survey booked by customer"))
    else:
        inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
        if not inst:
            inst = Installation(case_id=case.id, completion_email_sent=False)
            db.add(inst)
            db.flush()
        inst.scheduled_date = start_at
        inst.request_status = "accepted"
        if case.status == CaseStatus.permit_approved:
            assert_transition_allowed(from_status=case.status, to_status=CaseStatus.installation_scheduled)
            frm = case.status.value
            case.status = CaseStatus.installation_scheduled
            db.add(CaseStatusHistory(case_id=case.id, from_status=frm, to_status=CaseStatus.installation_scheduled.value, changed_by=None, note="Installation booked by customer"))

    db.commit()
    _notify_booked(db, case, kind, start_at)
    return appt


def cancel(db: Session, *, case: Case, kind: AppointmentKind) -> None:
    for a in _active(db, case, kind):
        a.status = AppointmentStatus.cancelled
    if kind == AppointmentKind.survey:
        survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
        if survey:
            survey.scheduled_date = None
            survey.request_status = None
    else:
        inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
        if inst:
            inst.scheduled_date = None
            inst.request_status = None
    db.commit()
