from __future__ import annotations

from datetime import datetime, timezone


def build_reference_number(year: int, seq: int) -> str:
    return f"FFT-{year}-{seq:04d}"


def build_prefixed_reference(prefix: str, year: int, seq: int) -> str:
    """Reference number for non-EV records (services / cleaning). e.g. SVC-2026-0001."""
    return f"{prefix}-{year}-{seq:04d}"


def current_year() -> int:
    return datetime.now(timezone.utc).astimezone().year

