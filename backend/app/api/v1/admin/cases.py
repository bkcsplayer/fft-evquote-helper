from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, CaseStatusHistory, Customer, Quote, Survey
from app.schemas.schemas import CaseDetailOut, CaseListItemOut, CaseStatusPatchIn, QuoteOut
from app.config import get_settings
from app.services.notification_service import notify_case_status_sms
from app.services.security import verify_password
from app.services.status_machine import assert_transition_allowed


router = APIRouter(prefix="/admin")


class CaseOverrideStatusIn(BaseModel):
    admin_password: str
    to_status: CaseStatus
    note: str | None = None


@router.get("/cases", response_model=list[CaseListItemOut])
def list_cases(
    status: CaseStatus | None = None,
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = (
        select(Case, Customer)
        .join(Customer, Customer.id == Case.customer_id)
        .order_by(Case.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        stmt = stmt.where(Case.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Customer.nickname.ilike(like),
                Customer.phone.ilike(like),
                Customer.email.ilike(like),
                Case.install_address.ilike(like),
                Case.reference_number.ilike(like),
            )
        )

    rows = db.execute(stmt).all()
    out: list[CaseListItemOut] = []
    for case, customer in rows:
        out.append(
            CaseListItemOut(
                id=case.id,
                reference_number=case.reference_number,
                status=case.status,
                customer_nickname=customer.nickname,
                phone=customer.phone,
                email=customer.email,
                install_address=case.install_address,
                created_at=case.created_at,
            )
        )
    return out


@router.get("/cases/{case_id}", response_model=CaseDetailOut)
def get_case(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    customer = db.get(Customer, case.customer_id)
    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    active_quote = (
        db.execute(select(Quote).where(Quote.case_id == case.id, Quote.is_active.is_(True)).limit(1))
        .scalar_one_or_none()
    )
    if active_quote:
        active_quote.addons
        _ = active_quote.signature
        active_quote = QuoteOut.model_validate(active_quote, from_attributes=True)

    return CaseDetailOut(
        id=case.id,
        reference_number=case.reference_number,
        status=case.status,
        access_token=case.access_token,
        charger_brand=case.charger_brand,
        ev_brand=case.ev_brand,
        install_address=case.install_address,
        pickup_date=case.pickup_date,
        preferred_install_date=case.preferred_install_date,
        referrer=case.referrer,
        preferred_survey_slots=case.preferred_survey_slots,
        notes=case.notes,
        created_at=case.created_at,
        updated_at=case.updated_at,
        customer={
            "nickname": customer.nickname,
            "phone": customer.phone,
            "email": customer.email,
        },
        survey_scheduled_date=survey.scheduled_date if survey else None,
        survey_deposit_paid=survey.deposit_paid if survey else None,
        survey_deposit_amount=survey.deposit_amount if survey else None,
        active_quote=active_quote,
    )


@router.patch("/cases/{case_id}/status")
def patch_case_status(
    case_id: str,
    payload: CaseStatusPatchIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    from_status = case.status.value
    assert_transition_allowed(from_status=case.status, to_status=payload.to_status)
    case.status = payload.to_status
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=payload.to_status.value,
            changed_by=admin.id,
            note=payload.note,
        )
    )
    db.commit()
    # Optional: notify customer about status changes (reduces confusion)
    customer = db.get(Customer, case.customer_id)
    if customer and customer.phone:
        settings = get_settings()
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note=payload.note or "Status updated by admin",
        )
        db.commit()
    return {"ok": True, "from": from_status, "to": payload.to_status.value}


@router.post("/cases/{case_id}/override-status")
def override_case_status(
    case_id: str,
    payload: CaseOverrideStatusIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if not verify_password(payload.admin_password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin password")

    from_status = case.status.value
    case.status = payload.to_status
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=payload.to_status.value,
            changed_by=admin.id,
            note=payload.note or "Admin override (password verified)",
        )
    )
    db.commit()

    customer = db.get(Customer, case.customer_id)
    if customer and customer.phone:
        settings = get_settings()
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note=payload.note or "Status updated by admin override",
        )
        db.commit()
    return {"ok": True, "from": from_status, "to": payload.to_status.value}

