from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.models import Case, CaseStatus, CaseStatusHistory, Installation, Quote, Survey
from app.schemas.schemas import CaseCreate, CaseStatusOut, CaseSubmittedOut
from app.services.case_service import create_case
from app.services.notification_service import (
    notify_email,
    notify_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)
from app.utils.url_utils import public_base_url


router = APIRouter()


class AppointmentRequestIn(BaseModel):
    requested_date: datetime = Field(description="ISO datetime (timezone required)")
    note: str | None = None


@router.post("/cases", response_model=CaseSubmittedOut)
def submit_case(payload: CaseCreate, request: Request, db: Session = Depends(get_db)):
    created = create_case(db, payload.model_dump())
    settings = get_settings()

    public_base = public_base_url(request=request, configured_url=settings.frontend_url)
    status_url = f"{public_base}/quote/status/{created.case.access_token}"
    ctx = {
        "title": "FFT - Submission received",
        "nickname": created.case.customer.nickname,
        "reference_number": created.case.reference_number,
        "status_url": status_url,
    }
    subject, html = render_email_from_db_or_files(
        db,
        template_key="submission_confirm",
        ctx=ctx,
        fallback_file="submission_confirm.html",
        fallback_subject="We received your EV charger quote request",
    )
    notify_email(
        db,
        case_id=str(created.case.id),
        to_email=created.case.customer.email,
        template_name="submission_confirm",
        subject=subject,
        html=html,
    )
    sms = render_sms_from_db_or_fallback(
        db,
        template_key="submission_confirm",
        ctx=ctx,
        fallback="{{ brand_name }}\nHi {{ nickname }}, we received your request.\nCase: {{ reference_number }}\nTrack: {{ status_url }}",
    )
    notify_sms(
        db,
        case_id=str(created.case.id),
        to_phone=created.case.customer.phone,
        template_name="submission_confirm",
        body=sms,
    )
    db.commit()

    return CaseSubmittedOut(
        reference_number=created.case.reference_number,
        access_token=created.case.access_token,
        status=created.case.status,
    )


@router.get("/cases/status/{token}", response_model=CaseStatusOut)
def get_case_status(token: str, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    active_quote = (
        db.execute(select(Quote.id).where(Quote.case_id == case.id, Quote.is_active.is_(True)).limit(1))
        .scalar_one_or_none()
    )

    return CaseStatusOut(
        reference_number=case.reference_number,
        status=case.status,
        created_at=case.created_at,
        updated_at=case.updated_at,
        survey_scheduled_date=survey.scheduled_date if survey else None,
        survey_deposit_paid=survey.deposit_paid if survey else None,
        survey_deposit_amount=survey.deposit_amount if survey else None,
        survey_requested_date=getattr(survey, "requested_date", None) if survey else None,
        survey_request_status=getattr(survey, "request_status", None) if survey else None,
        survey_request_admin_note=getattr(survey, "admin_note", None) if survey else None,
        quote_active_id=active_quote,
        installation_scheduled_date=inst.scheduled_date if inst else None,
        installation_requested_date=getattr(inst, "requested_date", None) if inst else None,
        installation_request_status=getattr(inst, "request_status", None) if inst else None,
        installation_request_admin_note=getattr(inst, "admin_note", None) if inst else None,
    )


@router.get("/cases/timeline/{token}")
def public_timeline(token: str, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")
    rows = (
        db.execute(
            select(CaseStatusHistory)
            .where(CaseStatusHistory.case_id == case.id)
            .order_by(CaseStatusHistory.created_at.asc())
        )
        .scalars()
        .all()
    )
    return [
        {
            "from_status": r.from_status,
            "to_status": r.to_status,
            "note": r.note,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.post("/cases/survey/request/{token}")
def request_survey_time(token: str, payload: AppointmentRequestIn, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")
    if case.status not in {CaseStatus.pending, CaseStatus.survey_scheduled}:
        raise HTTPException(
            status_code=400,
            detail="Survey time can only be requested before the survey is completed",
        )

    if payload.requested_date.tzinfo is None:
        raise HTTPException(status_code=400, detail="requested_date must include timezone")
    now = datetime.now(timezone.utc)
    if payload.requested_date <= now:
        raise HTTPException(status_code=400, detail="requested_date must be in the future")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        survey = Survey(case_id=case.id)
        db.add(survey)
        db.flush()

    survey.requested_date = payload.requested_date
    survey.request_status = "pending"
    survey.request_note = (payload.note or "").strip() or None
    survey.admin_note = None
    db.add(survey)

    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=case.status.value if case.status else None,
            to_status=case.status.value if case.status else "pending",
            changed_by=None,
            note=f"Customer requested survey time: {payload.requested_date.isoformat()}",
        )
    )

    db.commit()
    return {"ok": True, "requested_date": payload.requested_date}


@router.post("/cases/installation/request/{token}")
def request_installation_time(token: str, payload: AppointmentRequestIn, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")
    if case.status not in {CaseStatus.permit_approved, CaseStatus.installation_scheduled}:
        raise HTTPException(
            status_code=400,
            detail="Installation time can only be requested before installation is completed",
        )

    if payload.requested_date.tzinfo is None:
        raise HTTPException(status_code=400, detail="requested_date must include timezone")
    now = datetime.now(timezone.utc)
    if payload.requested_date <= now:
        raise HTTPException(status_code=400, detail="requested_date must be in the future")

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        inst = Installation(case_id=case.id, completion_email_sent=False)
        db.add(inst)
        db.flush()

    inst.requested_date = payload.requested_date
    inst.request_status = "pending"
    inst.request_note = (payload.note or "").strip() or None
    inst.admin_note = None
    db.add(inst)

    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=case.status.value if case.status else None,
            to_status=case.status.value if case.status else "pending",
            changed_by=None,
            note=f"Customer requested installation time: {payload.requested_date.isoformat()}",
        )
    )

    db.commit()
    return {"ok": True, "requested_date": payload.requested_date}

