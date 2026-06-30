"""Public branding endpoint — single source for the logo/brand used by the customer app,
the admin app, and emails. Reads the admin-managed brand_profile (SystemSetting) with config
fallback, and returns an absolute logo URL so it works anywhere.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.models import SystemSetting
from app.services.notification_service import _absolute_logo_url

router = APIRouter()


@router.get("/branding")
def get_branding(db: Session = Depends(get_db)):
    s = get_settings()
    row = db.execute(select(SystemSetting).where(SystemSetting.key == "brand_profile")).scalar_one_or_none()
    profile = row.value if row and isinstance(row.value, dict) else {}
    logo = (profile.get("logo_url") or "").strip() or s.brand_logo_url
    return {
        "brand_name": s.brand_name,
        "brand_short": s.brand_short,
        "logo_url": _absolute_logo_url(logo),
        "support_email": (profile.get("support_email") or "").strip() or s.brand_support_email,
        "support_phone": (profile.get("support_phone") or "").strip() or s.brand_support_phone,
    }
