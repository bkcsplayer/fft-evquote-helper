from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.models import Case, CaseStatus, CaseStatusHistory, Quote, QuoteAddon, QuoteSignature


def create_quote(db: Session, *, case_id: str, created_by: str | None, payload: dict[str, Any]) -> Quote:
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    next_version = (
        db.execute(select(func.coalesce(func.max(Quote.version), 0)).where(Quote.case_id == case.id)).scalar_one()
        + 1
    )

    db.execute(update(Quote).where(Quote.case_id == case.id).values(is_active=False))

    totals = _compute_totals(payload)

    quote = Quote(
        case_id=case.id,
        version=next_version,
        install_type=payload["install_type"],
        base_price=totals["base_price"],
        extra_distance_meters=totals["extra_distance_meters"],
        extra_distance_rate=totals["extra_distance_rate"],
        extra_distance_cost=totals["extra_distance_cost"],
        permit_fee=totals["permit_fee"],
        survey_credit=totals["survey_credit"],
        subtotal=totals["subtotal"],
        gst_rate=totals["gst_rate"],
        gst_amount=totals["gst_amount"],
        total=totals["total"],
        admin_notes=payload.get("admin_notes"),
        customer_notes=payload.get("customer_notes"),
        sent_at=None,
        is_active=True,
        created_by=created_by,
    )
    db.add(quote)
    db.flush()

    for addon in payload.get("addons") or []:
        db.add(
            QuoteAddon(
                quote_id=quote.id,
                name=addon["name"],
                price=addon["price"],
                description=addon.get("description"),
            )
        )

    if case.status in {CaseStatus.pending, CaseStatus.survey_scheduled, CaseStatus.survey_completed}:
        _transition_case_status(db, case=case, to_status=CaseStatus.quoting, changed_by=created_by, note="Start quoting")

    db.commit()
    db.refresh(quote)
    return quote


def mark_quote_sent(db: Session, *, quote_id: str, changed_by: str | None) -> Quote:
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    quote.sent_at = datetime.now(timezone.utc)
    db.add(quote)

    case = db.get(Case, quote.case_id)
    if case:
        _transition_case_status(
            db,
            case=case,
            to_status=CaseStatus.quoted,
            changed_by=changed_by,
            note=f"Quote v{quote.version} sent",
        )

    db.commit()
    db.refresh(quote)
    return quote


def approve_quote_by_token(
    db: Session, *, case_token: str, signed_name: str, signature_data: str, ip_address: str | None
) -> Quote:
    case = db.execute(select(Case).where(Case.access_token == case_token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    quote = (
        db.execute(select(Quote).where(Quote.case_id == case.id, Quote.is_active.is_(True)).limit(1))
        .scalar_one_or_none()
    )
    if not quote:
        raise HTTPException(status_code=404, detail="No active quote")

    existing_sig = db.execute(select(QuoteSignature).where(QuoteSignature.quote_id == quote.id)).scalar_one_or_none()
    if existing_sig:
        raise HTTPException(status_code=409, detail="Quote already approved")

    db.add(
        QuoteSignature(
            quote_id=quote.id,
            signed_name=signed_name,
            signature_data=signature_data,
            ip_address=ip_address,
        )
    )

    _transition_case_status(db, case=case, to_status=CaseStatus.customer_approved, changed_by=None, note="Approved")

    db.commit()
    db.refresh(quote)
    return quote


def _transition_case_status(
    db: Session, *, case: Case, to_status: CaseStatus, changed_by: str | None, note: str | None
) -> None:
    from_status = case.status.value if case.status else None
    case.status = to_status
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=to_status.value,
            changed_by=changed_by,
            note=note,
        )
    )


def _compute_totals(payload: dict[str, Any]) -> dict[str, Decimal]:
    base_price = Decimal(str(payload["base_price"]))
    extra_m = Decimal(str(payload.get("extra_distance_meters", 0)))
    extra_rate = Decimal(str(payload.get("extra_distance_rate", 0)))
    permit_fee = Decimal(str(payload.get("permit_fee", "349.00")))
    survey_credit = Decimal(str(payload.get("survey_credit", 0)))
    gst_rate = Decimal(str(payload.get("gst_rate", "5.00")))

    addons_total = sum((Decimal(str(a["price"])) for a in (payload.get("addons") or [])), Decimal("0"))
    extra_cost = (extra_m * extra_rate).quantize(Decimal("0.01"))

    subtotal = (base_price + extra_cost + permit_fee + addons_total - survey_credit).quantize(Decimal("0.01"))
    gst_amount = (subtotal * (gst_rate / Decimal("100"))).quantize(Decimal("0.01"))
    total = (subtotal + gst_amount).quantize(Decimal("0.01"))

    if subtotal < 0:
        raise HTTPException(status_code=400, detail="Invalid pricing (subtotal < 0)")

    return {
        "base_price": base_price,
        "extra_distance_meters": extra_m,
        "extra_distance_rate": extra_rate,
        "extra_distance_cost": extra_cost,
        "permit_fee": permit_fee,
        "survey_credit": survey_credit,
        "subtotal": subtotal,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "total": total,
    }

