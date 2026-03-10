from __future__ import annotations

from datetime import datetime, timezone


def build_reference_number(year: int, seq: int) -> str:
    return f"FFT-{year}-{seq:04d}"


def current_year() -> int:
    return datetime.now(timezone.utc).astimezone().year

