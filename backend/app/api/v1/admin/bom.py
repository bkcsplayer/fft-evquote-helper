from __future__ import annotations

import uuid as _uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseBomLine, InstallType, MaterialCatalog, Quote, QuoteSignature
from app.services.quote_service import create_quote

router = APIRouter(prefix="/admin")


class BomLineIn(BaseModel):
    material_id: str | None = None
    description: str = Field(min_length=1, max_length=255)
    qty: Decimal = Field(default=Decimal("1"), ge=0)
    unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0)
    note: str | None = Field(default=None, max_length=1000)


class BomLineUpdateIn(BaseModel):
    description: str | None = Field(default=None, max_length=255)
    qty: Decimal | None = Field(default=None, ge=0)
    unit_cost: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=1000)


class GenerateQuoteIn(BaseModel):
    install_type: InstallType = InstallType.surface_mount
    gst_rate: Decimal = Field(default=Decimal("5.00"), ge=0)
    permit_fee: Decimal = Field(default=Decimal("349.00"), ge=0)  # match the system pricing default
    survey_credit: Decimal = Field(default=Decimal("0"), ge=0)


def _line_total(qty: Decimal, unit_price: Decimal) -> Decimal:
    return (Decimal(str(qty or 0)) * Decimal(str(unit_price or 0))).quantize(Decimal("0.01"))


def _out(line: CaseBomLine) -> dict:
    return {
        "id": str(line.id),
        "case_id": str(line.case_id),
        "material_id": str(line.material_id) if line.material_id else None,
        "description": line.description,
        "qty": float(line.qty),
        "unit_cost": float(line.unit_cost),
        "unit_price": float(line.unit_price),
        "line_total": float(line.line_total),
        "note": line.note,
    }


@router.get("/cases/{case_id}/bom")
def list_bom(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = db.execute(
        select(CaseBomLine).where(CaseBomLine.case_id == case.id).order_by(CaseBomLine.created_at.asc())
    ).scalars().all()
    cost = sum((Decimal(str(r.unit_cost)) * Decimal(str(r.qty)) for r in rows), Decimal("0")).quantize(Decimal("0.01"))
    sell = sum((Decimal(str(r.line_total)) for r in rows), Decimal("0")).quantize(Decimal("0.01"))
    return {"lines": [_out(r) for r in rows], "total_cost": float(cost), "total_sell": float(sell)}


@router.post("/cases/{case_id}/bom")
def add_bom_line(
    case_id: str,
    payload: BomLineIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    material_id = None
    if payload.material_id:
        try:
            parsed = _uuid.UUID(str(payload.material_id))
        except (ValueError, AttributeError) as e:
            raise HTTPException(status_code=400, detail="material_id is not a valid UUID") from e
        material = db.get(MaterialCatalog, parsed)
        if not material:
            raise HTTPException(status_code=400, detail="Material not found")
        material_id = material.id

    line = CaseBomLine(
        case_id=case.id,
        material_id=material_id,
        description=payload.description,
        qty=payload.qty,
        unit_cost=payload.unit_cost,
        unit_price=payload.unit_price,
        line_total=_line_total(payload.qty, payload.unit_price),
        note=payload.note,
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return _out(line)


@router.patch("/bom/{line_id}")
def update_bom_line(
    line_id: str,
    payload: BomLineUpdateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    line = db.get(CaseBomLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="BOM line not found")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(line, field, value)
    line.line_total = _line_total(line.qty, line.unit_price)
    db.add(line)
    db.commit()
    db.refresh(line)
    return _out(line)


@router.delete("/bom/{line_id}")
def delete_bom_line(line_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    line = db.get(CaseBomLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="BOM line not found")
    db.delete(line)
    db.commit()
    return {"ok": True}


@router.post("/cases/{case_id}/bom/generate-quote")
def generate_quote_from_bom(
    case_id: str,
    payload: GenerateQuoteIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    """Roll the BOM sell side (Σ line_total) into a new active quote so it isn't re-entered by hand."""
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = db.execute(select(CaseBomLine).where(CaseBomLine.case_id == case.id)).scalars().all()
    if not rows:
        raise HTTPException(status_code=400, detail="No BOM lines to generate a quote from")

    # Guard: creating a new quote deactivates the current one. Refuse if the active quote is
    # already customer-signed, so a legal signature isn't silently superseded.
    signed = db.execute(
        select(QuoteSignature.id)
        .join(Quote, Quote.id == QuoteSignature.quote_id)
        .where(Quote.case_id == case.id, Quote.is_active.is_(True))
        .limit(1)
    ).first()
    if signed:
        raise HTTPException(
            status_code=409,
            detail="This case already has a customer-signed active quote. It cannot be replaced by a BOM-generated quote.",
        )

    base_price = sum((Decimal(str(r.line_total)) for r in rows), Decimal("0")).quantize(Decimal("0.01"))
    quote = create_quote(
        db,
        case_id=str(case.id),
        created_by=str(admin.id),
        payload={
            "install_type": payload.install_type,
            "base_price": base_price,
            "extra_distance_meters": Decimal("0"),
            "extra_distance_rate": Decimal("0"),
            "permit_fee": payload.permit_fee,
            "survey_credit": payload.survey_credit,
            "gst_rate": payload.gst_rate,
            "admin_notes": "Generated from BOM",
            "addons": [],
        },
    )
    return {"ok": True, "quote_id": str(quote.id), "base_price": float(base_price)}
