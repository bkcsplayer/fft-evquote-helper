"""Money helpers for the three service lines (diagnostic / bird netting / cleaning).

Pure Decimal, explicit ROUND_HALF_UP (tax convention), always exactly 2 decimals.
See ADR-016. The EV line keeps its own quote_service math (out of scope).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")
GST_RATE_PERCENT = Decimal("5.00")
DEPOSIT_RATE = Decimal("0.30")


def to_money(x) -> Decimal:
    return Decimal(str(x)).quantize(CENTS, rounding=ROUND_HALF_UP)


def with_gst(subtotal) -> tuple[Decimal, Decimal, Decimal]:
    """(subtotal, gst_amount, total) — total is GST-inclusive."""
    s = to_money(subtotal)
    gst = (s * GST_RATE_PERCENT / Decimal(100)).quantize(CENTS, ROUND_HALF_UP)
    return s, gst, s + gst


def deposit_split(total) -> tuple[Decimal, Decimal]:
    """(deposit, balance) — deposit is 30% of the GST-inclusive total; balance is the exact rest."""
    t = to_money(total)
    dep = (t * DEPOSIT_RATE).quantize(CENTS, ROUND_HALF_UP)
    return dep, t - dep


def suggested_rolls(perimeter_ft) -> int:
    """ceil(perimeter_ft / 100); None or <= 0 → 0 (CONTEXT.md: 建议卷数)."""
    if perimeter_ft is None or perimeter_ft <= 0:
        return 0
    return (perimeter_ft + 99) // 100
