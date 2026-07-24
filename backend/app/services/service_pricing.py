"""v3.0 service pricing, stored as a single SystemSetting row (`service_pricing`) with safe
defaults, mirroring the existing booking_config pattern. Defaults apply until an admin overrides
them; individual orders snapshot the live values at creation time so later edits never mutate
existing bookings/quotes/subscriptions.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import CleaningTier, SystemSetting

SERVICE_PRICING_KEY = "service_pricing"

DEFAULT_SERVICE_PRICING: dict[str, Any] = {
    "diagnostic_hourly_rate": 179.00,
    "bird_netting_roll_price": 599.00,
    "bird_netting_nest_fee": 199.00,
    "cleaning_tier1_price": 599.00,   # <= tier1 max panels
    "cleaning_tier2_price": 799.00,   # tier1_max < panels <= tier2 max
    "cleaning_tier1_max_panels": 20,
    "cleaning_tier2_max_panels": 35,
    "currency": "CAD",
}


def get_service_pricing(db: Session) -> dict[str, Any]:
    row = db.execute(
        select(SystemSetting).where(SystemSetting.key == SERVICE_PRICING_KEY)
    ).scalar_one_or_none()
    override = row.value if row and isinstance(row.value, dict) else {}
    return {**DEFAULT_SERVICE_PRICING, **override}


def resolve_cleaning_tier(pricing: dict[str, Any], panel_count: int) -> tuple[CleaningTier, float | None]:
    """Return (tier, annual_price). annual_price is None for the custom tier (admin sets it)."""
    t1_max = int(pricing["cleaning_tier1_max_panels"])
    t2_max = int(pricing["cleaning_tier2_max_panels"])
    if panel_count <= t1_max:
        return CleaningTier.tier1, float(pricing["cleaning_tier1_price"])
    if panel_count <= t2_max:
        return CleaningTier.tier2, float(pricing["cleaning_tier2_price"])
    return CleaningTier.custom, None
