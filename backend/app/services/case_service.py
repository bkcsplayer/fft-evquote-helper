from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Case, CaseStatus, CaseStatusHistory, Customer
from app.utils.reference import build_reference_number, current_year
from app.utils.token import generate_access_token


@dataclass(frozen=True)
class CaseCreated:
    case: Case


def create_case(db: Session, payload: dict[str, Any]) -> CaseCreated:
    customer_in = payload["customer"]
    customer = Customer(
        nickname=customer_in["nickname"],
        phone=customer_in["phone"],
        email=customer_in["email"],
    )
    db.add(customer)
    db.flush()

    reference_number = _next_reference_number(db)
    access_token = generate_access_token()

    case = Case(
        reference_number=reference_number,
        customer_id=customer.id,
        status=CaseStatus.pending,
        charger_brand=payload["charger_brand"],
        ev_brand=payload["ev_brand"],
        install_address=payload["install_address"],
        pickup_date=payload.get("pickup_date"),
        preferred_install_date=payload.get("preferred_install_date"),
        referrer=payload.get("referrer"),
        preferred_survey_slots=payload.get("preferred_survey_slots") or {},
        notes=payload.get("notes"),
        access_token=access_token,
    )
    db.add(case)
    db.flush()

    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=None,
            to_status=CaseStatus.pending.value,
            changed_by=None,
            note="Customer submitted quote request",
        )
    )
    db.commit()
    db.refresh(case)
    return CaseCreated(case=case)


def _next_reference_number(db: Session) -> str:
    year = current_year()
    prefix = f"FFT-{year}-"
    last_ref = (
        db.execute(
            select(Case.reference_number)
            .where(Case.reference_number.like(f"{prefix}%"))
            .order_by(Case.reference_number.desc())
            .limit(1)
        )
        .scalar_one_or_none()
    )
    if not last_ref:
        return build_reference_number(year, 1)

    try:
        last_seq = int(last_ref.split("-")[-1])
    except Exception:
        last_seq = 0
    return build_reference_number(year, last_seq + 1)

