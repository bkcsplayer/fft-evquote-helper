from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Case, CaseNote, CaseStatusHistory, Survey, SystemSetting


router = APIRouter()


class CreateCheckoutIn(BaseModel):
    token: str


class CreateCheckoutOut(BaseModel):
    url: str


@router.post("/payments/create-checkout", response_model=CreateCheckoutOut)
def create_checkout(payload: CreateCheckoutIn, db: Session = Depends(get_db)):
    _ = payload
    _ = db
    raise HTTPException(status_code=410, detail="Stripe checkout disabled. Please use e-transfer.")


class ETransferInfoOut(BaseModel):
    recipient_name: str | None = None
    recipient_email: str
    instructions: str | None = None
    amount: float
    reference_number: str


@router.get("/payments/etransfer-info/{token}", response_model=ETransferInfoOut)
def etransfer_info(token: str, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey or not survey.scheduled_date:
        raise HTTPException(status_code=400, detail="Survey not scheduled yet")

    settings_row = db.execute(select(SystemSetting).where(SystemSetting.key == "etransfer_settings")).scalar_one_or_none()
    et = (settings_row.value if settings_row else {}) or {}
    recipient_email = et.get("recipient_email") or "payments@example.com"

    return ETransferInfoOut(
        recipient_name=et.get("recipient_name"),
        recipient_email=recipient_email,
        instructions=et.get("instructions"),
        amount=float(survey.deposit_amount),
        reference_number=case.reference_number,
    )


class ETransferNotifyIn(BaseModel):
    token: str
    sender_name: str | None = None
    note: str | None = None


@router.post("/payments/etransfer-notify")
def etransfer_notify(payload: ETransferNotifyIn, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == payload.token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey or not survey.scheduled_date:
        raise HTTPException(status_code=400, detail="Survey not scheduled yet")
    if survey.deposit_paid:
        return {"ok": True, "already_paid": True}

    content = "Customer reported e-transfer sent."
    if payload.sender_name:
        content += f" Sender: {payload.sender_name.strip()}."
    if payload.note:
        content += f" Note: {payload.note.strip()}"

    db.add(CaseNote(case_id=case.id, admin_user_id=None, content=content))
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=case.status.value if case.status else None,
            to_status=case.status.value if case.status else "pending",
            changed_by=None,
            note="Customer reported e-transfer sent",
        )
    )
    db.commit()
    return {"ok": True}


@router.post("/payments/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    _ = request
    _ = db
    raise HTTPException(status_code=410, detail="Stripe webhook disabled. Please use e-transfer.")

