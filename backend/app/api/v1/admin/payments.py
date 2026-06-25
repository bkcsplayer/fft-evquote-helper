from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import (
    AdminUser,
    Case,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    Survey,
)

router = APIRouter(prefix="/admin")


class PaymentCreateIn(BaseModel):
    kind: PaymentKind
    method: PaymentMethod = PaymentMethod.etransfer
    amount: Decimal = Field(ge=0)
    status: PaymentStatus = PaymentStatus.pending
    reference: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=1000)


class PaymentUpdateIn(BaseModel):
    status: PaymentStatus | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    method: PaymentMethod | None = None
    reference: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=1000)


def _out(p: Payment) -> dict:
    return {
        "id": str(p.id),
        "case_id": str(p.case_id),
        "kind": p.kind.value,
        "method": p.method.value,
        "amount": float(p.amount),
        "status": p.status.value,
        "reference": p.reference,
        "received_at": p.received_at,
        "note": p.note,
        "created_at": p.created_at,
    }


def _sync_survey_deposit(db: Session, case_id) -> None:
    """
    Keep the denormalized Survey.deposit_paid flag in step with the ledger.

    Nets received deposits against confirmed refunds so a refunded deposit correctly flips the flag
    back to unpaid (and clears the 'reported' marker so it stops showing as awaiting confirmation).
    """
    survey = db.execute(select(Survey).where(Survey.case_id == case_id)).scalar_one_or_none()
    if not survey:
        return
    payments = db.execute(select(Payment).where(Payment.case_id == case_id)).scalars().all()
    deposits = sum(
        (p.amount for p in payments if p.kind == PaymentKind.deposit and p.status == PaymentStatus.received),
        0,
    )
    refunds = sum(
        (p.amount for p in payments if p.kind == PaymentKind.refund and p.status in (PaymentStatus.received, PaymentStatus.refunded)),
        0,
    )
    net = deposits - refunds
    survey.deposit_paid = net > 0
    if net > 0:
        survey.deposit_reported = True
    elif deposits > 0:
        # The deposit was received then refunded — no longer awaiting confirmation.
        survey.deposit_reported = False
    db.add(survey)


@router.get("/cases/{case_id}/payments")
def list_payments(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = db.execute(
        select(Payment).where(Payment.case_id == case.id).order_by(Payment.created_at.desc())
    ).scalars().all()
    return [_out(p) for p in rows]


@router.post("/cases/{case_id}/payments")
def create_payment(
    case_id: str,
    payload: PaymentCreateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    p = Payment(
        case_id=case.id,
        kind=payload.kind,
        method=payload.method,
        amount=payload.amount,
        status=payload.status,
        reference=payload.reference,
        note=payload.note,
        recorded_by=admin.id,
        received_at=datetime.now(timezone.utc) if payload.status == PaymentStatus.received else None,
    )
    db.add(p)
    db.flush()
    # Sync on every mutation (a refund affects the deposit flag too, not just deposit-kind rows).
    _sync_survey_deposit(db, case.id)
    db.commit()
    db.refresh(p)
    return _out(p)


@router.patch("/payments/{payment_id}")
def update_payment(
    payment_id: str,
    payload: PaymentUpdateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")

    # exclude_unset distinguishes "not sent" from an explicit null (so reference/note can be cleared).
    data = payload.model_dump(exclude_unset=True)
    if "amount" in data and data["amount"] is not None:
        p.amount = data["amount"]
    if "method" in data and data["method"] is not None:
        p.method = data["method"]
    if "reference" in data:
        p.reference = data["reference"]
    if "note" in data:
        p.note = data["note"]
    if "status" in data and data["status"] is not None:
        new_status = data["status"]
        if new_status == PaymentStatus.received and p.received_at is None:
            p.received_at = datetime.now(timezone.utc)
        elif new_status != PaymentStatus.received:
            p.received_at = None
        p.status = new_status

    db.add(p)
    db.flush()
    _sync_survey_deposit(db, p.case_id)
    db.commit()
    db.refresh(p)
    return _out(p)
