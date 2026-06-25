from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Case, CaseBomLine, Payment, PaymentKind, PaymentStatus, Quote

_CENTS = Decimal("0.01")


def _q(v: object) -> Decimal:
    """Coerce any numeric-ish value to a 2dp Decimal (treats None as 0)."""
    return Decimal(str(v if v is not None else 0)).quantize(_CENTS)


def _sum(values: Iterable[Decimal]) -> Decimal:
    return sum(values, Decimal("0")).quantize(_CENTS)


@dataclass(frozen=True)
class CaseFinancials:
    contract_total: Decimal   # active quote total (what the customer pays, incl GST)
    revenue_ex_gst: Decimal   # active quote subtotal (revenue, GST excluded)
    gst: Decimal
    cost: Decimal             # Σ BOM unit_cost · qty (materials + labor)
    margin: Decimal           # revenue_ex_gst − cost
    margin_pct: float         # margin / revenue_ex_gst × 100
    deposit_received: Decimal
    total_received: Decimal   # received deposit + balance − refunds
    balance_due: Decimal      # contract_total − total_received
    has_quote: bool
    bom_line_count: int

    def as_dict(self) -> dict:
        return {
            "contract_total": float(self.contract_total),
            "revenue_ex_gst": float(self.revenue_ex_gst),
            "gst": float(self.gst),
            "cost": float(self.cost),
            "margin": float(self.margin),
            "margin_pct": self.margin_pct,
            "deposit_received": float(self.deposit_received),
            "total_received": float(self.total_received),
            "balance_due": float(self.balance_due),
            "has_quote": self.has_quote,
            "bom_line_count": self.bom_line_count,
        }


def compute_case_financials(db: Session, case: Case) -> CaseFinancials:
    """
    Per-case P&L computed (never stored) from the active quote, the BOM, and the payment ledger.

    Revenue is taken ex-GST (the subtotal) for margin, since GST is remitted, not earned.
    Cost is the internal BOM cost side (unit_cost), distinct from the customer-facing unit_price.
    """
    quote = db.execute(
        select(Quote).where(Quote.case_id == case.id, Quote.is_active.is_(True)).limit(1)
    ).scalar_one_or_none()

    contract_total = _q(quote.total) if quote else Decimal("0.00")
    revenue_ex_gst = _q(quote.subtotal) if quote else Decimal("0.00")
    gst = _q(quote.gst_amount) if quote else Decimal("0.00")

    bom_lines = db.execute(select(CaseBomLine).where(CaseBomLine.case_id == case.id)).scalars().all()
    cost = _sum(_q(Decimal(str(line.unit_cost or 0)) * Decimal(str(line.qty or 0))) for line in bom_lines)

    payments = db.execute(select(Payment).where(Payment.case_id == case.id)).scalars().all()
    deposit_received = _sum(
        _q(p.amount)
        for p in payments
        if p.kind == PaymentKind.deposit and p.status == PaymentStatus.received
    )
    cash_in = _sum(
        _q(p.amount)
        for p in payments
        if p.status == PaymentStatus.received and p.kind in (PaymentKind.deposit, PaymentKind.balance)
    )
    refunds = _sum(
        _q(p.amount)
        for p in payments
        if p.kind == PaymentKind.refund and p.status in (PaymentStatus.received, PaymentStatus.refunded)
    )
    total_received = (cash_in - refunds).quantize(_CENTS)
    balance_due = (contract_total - total_received).quantize(_CENTS)

    margin = (revenue_ex_gst - cost).quantize(_CENTS)
    margin_pct = float((margin / revenue_ex_gst * 100).quantize(Decimal("0.1"))) if revenue_ex_gst > 0 else 0.0

    return CaseFinancials(
        contract_total=contract_total,
        revenue_ex_gst=revenue_ex_gst,
        gst=gst,
        cost=cost,
        margin=margin,
        margin_pct=margin_pct,
        deposit_received=deposit_received,
        total_received=total_received,
        balance_due=balance_due,
        has_quote=quote is not None,
        bom_line_count=len(bom_lines),
    )
