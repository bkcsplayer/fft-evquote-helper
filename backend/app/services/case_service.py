from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.models import (
    Appointment,
    Case,
    CaseAttachment,
    CaseBomLine,
    CaseNote,
    CaseStatus,
    CaseStatusHistory,
    Customer,
    Installation,
    InstallationPhoto,
    Notification,
    Payment,
    Permit,
    PermitAttachment,
    Quote,
    QuoteAddon,
    QuoteSignature,
    Survey,
    SurveyPhoto,
)
from app.utils.reference import build_reference_number, current_year
from app.utils.token import generate_access_token

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CaseCreated:
    case: Case


def _remove_files(paths: list[str | None]) -> None:
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except OSError as exc:
            logger.warning("Could not remove file %s: %s", p, exc)


def delete_case_cascade(db: Session, case: Case) -> None:
    """Hard-delete a case and every dependent record (and its uploaded files), in FK-safe order."""
    cid = case.id
    customer_id = case.customer_id

    survey_ids = [s for (s,) in db.execute(select(Survey.id).where(Survey.case_id == cid))]
    quote_ids = [q for (q,) in db.execute(select(Quote.id).where(Quote.case_id == cid))]
    permit = db.execute(select(Permit).where(Permit.case_id == cid)).scalar_one_or_none()
    inst = db.execute(select(Installation).where(Installation.case_id == cid)).scalar_one_or_none()

    # Collect file paths to remove from disk after the DB rows are gone.
    file_paths: list[str | None] = []
    if survey_ids:
        file_paths += [p for (p,) in db.execute(select(SurveyPhoto.file_path).where(SurveyPhoto.survey_id.in_(survey_ids)))]
    if permit:
        file_paths += [p for (p,) in db.execute(select(PermitAttachment.file_path).where(PermitAttachment.permit_id == permit.id))]
    if inst:
        file_paths += [p for (p,) in db.execute(select(InstallationPhoto.file_path).where(InstallationPhoto.installation_id == inst.id))]
    file_paths += [p for (p,) in db.execute(select(CaseAttachment.file_path).where(CaseAttachment.case_id == cid))]

    # Grandchildren first
    if survey_ids:
        db.execute(delete(SurveyPhoto).where(SurveyPhoto.survey_id.in_(survey_ids)))
    if quote_ids:
        db.execute(delete(QuoteAddon).where(QuoteAddon.quote_id.in_(quote_ids)))
        db.execute(delete(QuoteSignature).where(QuoteSignature.quote_id.in_(quote_ids)))
    if permit:
        db.execute(delete(PermitAttachment).where(PermitAttachment.permit_id == permit.id))
    if inst:
        db.execute(delete(InstallationPhoto).where(InstallationPhoto.installation_id == inst.id))

    # Direct children of the case
    for model in (Appointment, Survey, Quote, Permit, Installation, Notification, CaseNote, CaseStatusHistory, CaseAttachment, Payment, CaseBomLine):
        db.execute(delete(model).where(model.case_id == cid))

    db.execute(delete(Case).where(Case.id == cid))

    # Remove the customer if they have no other cases.
    other = db.execute(select(Case.id).where(Case.customer_id == customer_id).limit(1)).first()
    if not other:
        db.execute(delete(Customer).where(Customer.id == customer_id))

    db.commit()
    _remove_files(file_paths)


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

