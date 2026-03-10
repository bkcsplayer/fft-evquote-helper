from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, CaseStatusHistory, Customer, Survey
from app.services.notification_service import (
    notify_email,
    notify_sms,
    notify_case_status_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)


router = APIRouter(prefix="/admin")


class SurveyScheduleIn(BaseModel):
    scheduled_date: datetime = Field(description="ISO datetime with timezone preferred")


class SurveyCompleteIn(BaseModel):
    survey_notes: str | None = None


class SurveyDepositPaidIn(BaseModel):
    note: str | None = None


@router.post("/cases/{case_id}/survey/schedule")
def schedule_survey(
    case_id: str,
    payload: SurveyScheduleIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        survey = Survey(case_id=case.id)
        db.add(survey)
        db.flush()

    survey.scheduled_date = payload.scheduled_date
    db.add(survey)

    from_status = case.status.value
    case.status = CaseStatus.survey_scheduled
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=CaseStatus.survey_scheduled.value,
            changed_by=admin.id,
            note="Survey scheduled",
        )
    )
    db.commit()
    settings = get_settings()
    customer = db.get(Customer, case.customer_id)
    if customer:
        pay_url = f"{settings.frontend_url}/quote/survey-confirm/{case.access_token}"
        scheduled_text = payload.scheduled_date.astimezone().strftime("%Y-%m-%d %H:%M %Z")
        ctx = {
            "title": "FFT - Survey scheduled",
            "nickname": customer.nickname,
            "scheduled_text": scheduled_text,
            "deposit_amount": f"{float(survey.deposit_amount):.2f}",
            "pay_url": pay_url,
        }
        subject, html = render_email_from_db_or_files(
            db,
            template_key="survey_scheduled",
            ctx=ctx,
            fallback_file="survey_scheduled.html",
            fallback_subject="Your EV charger site survey is scheduled",
        )
        notify_email(
            db,
            case_id=str(case.id),
            to_email=customer.email,
            template_name="survey_scheduled",
            subject=subject,
            html=html,
        )
        sms = render_sms_from_db_or_fallback(
            db,
            template_key="survey_scheduled",
            ctx=ctx,
            fallback=(
                "[FFT] Hi {{ nickname }}, your site survey is scheduled for {{ scheduled_text }}. "
                "Please pay the deposit here: {{ pay_url }}"
            ),
        )
        notify_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            template_name="survey_scheduled",
            body=sms,
        )
        db.commit()
    return {"ok": True}


@router.patch("/cases/{case_id}/survey/complete")
def complete_survey(
    case_id: str,
    payload: SurveyCompleteIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=400, detail="Survey not scheduled")

    survey.completed_at = datetime.now(timezone.utc)
    if payload.survey_notes:
        survey.survey_notes = payload.survey_notes
    db.add(survey)

    from_status = case.status.value
    case.status = CaseStatus.survey_completed
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=CaseStatus.survey_completed.value,
            changed_by=admin.id,
            note="Survey completed",
        )
    )

    db.commit()

    # Notify customer about status update (helps reduce confusion / refresh needs)
    settings = get_settings()
    customer = db.get(Customer, case.customer_id)
    if customer:
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note="Survey completed",
        )
        db.commit()
    return {"ok": True}


@router.patch("/cases/{case_id}/survey/deposit-paid")
def mark_survey_deposit_paid(
    case_id: str,
    payload: SurveyDepositPaidIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=400, detail="Survey not scheduled")

    if survey.deposit_paid:
        return {"ok": True, "already_paid": True}

    survey.deposit_paid = True
    survey.stripe_payment_id = None
    db.add(survey)

    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=case.status.value if case.status else None,
            to_status=case.status.value if case.status else "pending",
            changed_by=admin.id,
            note=payload.note or "Deposit marked paid (e-transfer)",
        )
    )
    db.commit()

    # Notify customer
    settings = get_settings()
    customer = db.get(Customer, case.customer_id)
    if customer:
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        ctx = {
            "title": "FFT - Deposit received",
            "nickname": customer.nickname,
            "reference_number": case.reference_number,
            "status_url": status_url,
        }
        subject, html = render_email_from_db_or_files(
            db,
            template_key="survey_deposit_received",
            ctx=ctx,
            fallback_file="survey_deposit_received.html",
            fallback_subject="We received your survey deposit",
        )
        notify_email(
            db,
            case_id=str(case.id),
            to_email=customer.email,
            template_name="survey_deposit_received",
            subject=subject,
            html=html,
        )
        sms = render_sms_from_db_or_fallback(
            db,
            template_key="survey_deposit_received",
            ctx=ctx,
            fallback="[FFT] Deposit received. Thank you! Case: {{ reference_number }}. Status: {{ status_url }}",
        )
        notify_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            template_name="survey_deposit_received",
            body=sms,
        )
        db.commit()

    return {"ok": True}

@router.get("/surveys/calendar")
def surveys_calendar(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    rows = db.execute(
        select(Survey, Case, Customer)
        .join(Case, Case.id == Survey.case_id)
        .join(Customer, Customer.id == Case.customer_id)
        .where(Survey.scheduled_date.is_not(None), Survey.scheduled_date >= start, Survey.scheduled_date <= end)
        .order_by(Survey.scheduled_date.asc())
    ).all()

    case_ids = [case.id for _, case, _ in rows]
    reported_map: dict[str, datetime] = {}
    if case_ids:
        rep_rows = (
            db.execute(
                select(CaseStatusHistory.case_id, func.max(CaseStatusHistory.created_at))
                .where(
                    CaseStatusHistory.case_id.in_(case_ids),
                    CaseStatusHistory.note == "Customer reported e-transfer sent",
                )
                .group_by(CaseStatusHistory.case_id)
            )
            .all()
        )
        reported_map = {str(cid): dt for cid, dt in rep_rows if dt is not None}
    out = []
    for survey, case, customer in rows:
        out.append(
            {
                "case_id": str(case.id),
                "case_status": case.status.value if case.status else None,
                "reference_number": case.reference_number,
                "customer_nickname": customer.nickname,
                "install_address": case.install_address,
                "scheduled_date": survey.scheduled_date,
                "completed_at": survey.completed_at,
                "deposit_paid": survey.deposit_paid,
                "deposit_reported_at": reported_map.get(str(case.id)),
            }
        )
    return out

