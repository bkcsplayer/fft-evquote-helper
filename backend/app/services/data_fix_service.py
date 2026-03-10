from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import ChargerBrand
from app.services.bootstrap_service import DEFAULT_BRANDS


def repair_charger_brand_seed(db: Session) -> None:
    """
    Ensure default brands exist (idempotent) and repair the two Chinese items
    that may have been inserted with wrong encoding on Windows terminals.
    """
    existing = db.execute(select(ChargerBrand)).scalars().all()
    existing_names = {b.name for b in existing}

    for idx, name in enumerate(DEFAULT_BRANDS, start=1):
        if name in existing_names:
            continue
        db.add(ChargerBrand(name=name, sort_order=idx, is_active=True))

    # Repair: if there are 10 defaults but last two look garbled, replace by sort_order 9/10
    # This is a best-effort heuristic and safe to run repeatedly.
    b9 = db.execute(select(ChargerBrand).where(ChargerBrand.sort_order == 9).limit(1)).scalar_one_or_none()
    b10 = db.execute(select(ChargerBrand).where(ChargerBrand.sort_order == 10).limit(1)).scalar_one_or_none()
    if b9 and b9.name not in DEFAULT_BRANDS:
        b9.name = DEFAULT_BRANDS[8]
        db.add(b9)
    if b10 and b10.name not in DEFAULT_BRANDS:
        b10.name = DEFAULT_BRANDS[9]
        db.add(b10)

    db.commit()

