from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin, require_super_admin
from app.models.models import AdminUser, ChargerBrand, SystemSetting
from app.schemas.schemas import ChargerBrandIn, ChargerBrandOut, SettingsOut, SettingsPutIn


router = APIRouter(prefix="/admin")


@router.get("/settings", response_model=list[SettingsOut])
def get_settings(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    rows = db.execute(select(SystemSetting)).scalars().all()
    return [{"key": r.key, "value": r.value} for r in rows]


@router.put("/settings/{key}", response_model=SettingsOut)
def put_setting(
    key: str,
    payload: SettingsPutIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_super_admin),
):
    _ = admin
    row = db.execute(select(SystemSetting).where(SystemSetting.key == key)).scalar_one_or_none()
    if not row:
        row = SystemSetting(key=key, value=payload.value)
        db.add(row)
    else:
        row.value = payload.value
        db.add(row)
    db.commit()
    return {"key": row.key, "value": row.value}


@router.get("/charger-brands", response_model=list[ChargerBrandOut])
def list_brands(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    brands = db.execute(select(ChargerBrand).order_by(ChargerBrand.sort_order.asc())).scalars().all()
    return brands


@router.post("/charger-brands", response_model=ChargerBrandOut)
def create_brand(
    payload: ChargerBrandIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_super_admin),
):
    _ = admin
    exists = db.execute(select(ChargerBrand).where(ChargerBrand.name == payload.name)).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Brand already exists")
    brand = ChargerBrand(name=payload.name, sort_order=payload.sort_order, is_active=payload.is_active)
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.put("/charger-brands/{brand_id}", response_model=ChargerBrandOut)
def update_brand(
    brand_id: str,
    payload: ChargerBrandIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_super_admin),
):
    _ = admin
    brand = db.get(ChargerBrand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    brand.name = payload.name
    brand.sort_order = payload.sort_order
    brand.is_active = payload.is_active
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.delete("/charger-brands/{brand_id}")
def delete_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_super_admin),
):
    _ = admin
    brand = db.get(ChargerBrand, brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(brand)
    db.commit()
    return {"ok": True}

