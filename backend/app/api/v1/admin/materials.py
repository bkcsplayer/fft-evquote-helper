from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, CaseBomLine, MaterialCatalog, MaterialCategory

router = APIRouter(prefix="/admin")


class MaterialIn(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    category: MaterialCategory = MaterialCategory.misc
    unit: str = Field(default="each", max_length=50)
    default_unit_cost: Decimal = Field(default=Decimal("0"), ge=0)
    default_sell_price: Decimal = Field(default=Decimal("0"), ge=0)
    active: bool = True


class MaterialUpdateIn(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    category: MaterialCategory | None = None
    unit: str | None = Field(default=None, max_length=50)
    default_unit_cost: Decimal | None = Field(default=None, ge=0)
    default_sell_price: Decimal | None = Field(default=None, ge=0)
    active: bool | None = None


def _out(m: MaterialCatalog) -> dict:
    return {
        "id": str(m.id),
        "sku": m.sku,
        "name": m.name,
        "category": m.category.value,
        "unit": m.unit,
        "default_unit_cost": float(m.default_unit_cost),
        "default_sell_price": float(m.default_sell_price),
        "active": m.active,
    }


@router.get("/materials")
def list_materials(
    active_only: bool = False,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = select(MaterialCatalog).order_by(MaterialCatalog.category.asc(), MaterialCatalog.name.asc())
    if active_only:
        stmt = stmt.where(MaterialCatalog.active.is_(True))
    return [_out(m) for m in db.execute(stmt).scalars().all()]


@router.post("/materials")
def create_material(payload: MaterialIn, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    exists = db.execute(select(MaterialCatalog.id).where(MaterialCatalog.sku == payload.sku)).first()
    if exists:
        raise HTTPException(status_code=409, detail="A material with this SKU already exists")
    m = MaterialCatalog(**payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.patch("/materials/{material_id}")
def update_material(
    material_id: str,
    payload: MaterialUpdateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    m = db.get(MaterialCatalog, material_id)
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.delete("/materials/{material_id}")
def delete_material(material_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    m = db.get(MaterialCatalog, material_id)
    if not m:
        raise HTTPException(status_code=404, detail="Material not found")
    # If referenced by any BOM line, deactivate instead of deleting (preserve history).
    referenced = db.execute(select(CaseBomLine.id).where(CaseBomLine.material_id == m.id).limit(1)).first()
    if referenced:
        m.active = False
        db.add(m)
        db.commit()
        return {"ok": True, "deactivated": True}
    db.delete(m)
    db.commit()
    return {"ok": True, "deleted": True}
