from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.models import Case, CaseStatusHistory, Quote, Survey
from app.schemas.schemas import CaseCreate, CaseStatusOut, CaseSubmittedOut
from app.services.case_service import create_case
from app.services.notification_service import (
    notify_email,
    notify_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)


router = APIRouter()


@router.post("/cases", response_model=CaseSubmittedOut)
def submit_case(payload: CaseCreate, db: Session = Depends(get_db)):
    created = create_case(db, payload.model_dump())
    settings = get_settings()

    status_url = f"{settings.frontend_url}/quote/status/{created.case.access_token}"
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
        fallback="[FFT] Hi {{ nickname }}, we received your request. Track status: {{ status_url }}",
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
        quote_active_id=active_quote,
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

