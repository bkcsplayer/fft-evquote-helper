"""Service-area gate (pure logic). Matches a customer location against enabled regions by
postal FSA prefix, with city-name fallback. Master switch off => nobody is served.
"""

from __future__ import annotations

from typing import Any


def _norm_postal(postal: str | None) -> str:
    return "".join(str(postal or "").upper().split())


def check_service_area(
    config: dict[str, Any], *, postal: str | None = None, city: str | None = None
) -> tuple[bool, str | None]:
    """Return (allowed, region_name | None)."""
    if not config or not config.get("master_enabled", True):
        return False, None
    p = _norm_postal(postal)
    c = (city or "").strip().lower()
    for region in config.get("regions", []):
        if not region.get("enabled"):
            continue
        for pref in region.get("fsa_prefixes", []):
            pref_n = str(pref or "").upper().replace(" ", "")
            if p and pref_n and p.startswith(pref_n):
                return True, region.get("name")
        for cn in region.get("cities", []):
            if c and c == str(cn or "").strip().lower():
                return True, region.get("name")
    return False, None
