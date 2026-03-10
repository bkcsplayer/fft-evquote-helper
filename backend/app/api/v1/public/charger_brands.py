from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import ChargerBrand
from app.schemas.schemas import ChargerBrandOut


router = APIRouter()


@router.get("/charger-brands", response_model=list[ChargerBrandOut])
def list_charger_brands(db: Session = Depends(get_db)):
    brands = (
        db.execute(
            select(ChargerBrand).where(ChargerBrand.is_active.is_(True)).order_by(ChargerBrand.sort_order.asc())
        )
        .scalars()
        .all()
    )
    return brands

