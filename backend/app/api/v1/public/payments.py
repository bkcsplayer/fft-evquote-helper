from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Case, CaseNote, CaseStatusHistory, Survey, SystemSetting
from app.services.notification_service import notify_admin_event


router = APIRouter()


class CreateCheckoutIn(BaseModel):
    token: str


class CreateCheckoutOut(BaseModel):
    url: str


# NOTE: Stripe is intentionally disabled — payments are manual e-transfer only.
# These endpoints are kept as explicit 410s (the frontend may still reference them) until
# the Payment ledger (Phase 5) supersedes them. See docs/CLEANUP-REPORT.md.
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
    token: str = Field(max_length=64)
    sender_name: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=1000)


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
    # Idempotent: once reported, don't duplicate the audit trail or re-spam the admin inbox.
    if survey.deposit_reported:
        return {"ok": True, "already_reported": True}

    # Structured marker (replaces fragile timeline string-matching on the frontend).
    survey.deposit_reported = True
    survey.deposit_reported_at = datetime.now(timezone.utc)
    db.add(survey)

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

    notify_admin_event(
        db,
        case_id=str(case.id),
        reference_number=case.reference_number,
        event_key="admin_etransfer_reported",
        heading="Customer reported an e-transfer",
        summary="A customer reported they sent the survey deposit by e-transfer. Please confirm receipt.",
        customer_nickname=case.customer.nickname if case.customer else None,
        customer_phone=case.customer.phone if case.customer else None,
        customer_email=case.customer.email if case.customer else None,
        extra_lines=[
            f"Amount: ${float(survey.deposit_amount):.2f}",
            *( [f"Sender: {payload.sender_name.strip()}"] if payload.sender_name else [] ),
            *( [f"Note: {payload.note.strip()}"] if payload.note else [] ),
        ],
    )

    db.commit()
    return {"ok": True}


@router.post("/payments/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    _ = request
    _ = db
    raise HTTPException(status_code=410, detail="Stripe webhook disabled. Please use e-transfer.")

