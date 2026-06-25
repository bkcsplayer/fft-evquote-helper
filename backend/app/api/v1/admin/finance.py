from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, CaseStatusHistory, Customer
from app.services.finance_service import compute_case_financials

router = APIRouter(prefix="/admin")


@router.get("/cases/{case_id}/financials")
def case_financials(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return compute_case_financials(db, case).as_dict()


def _csv_safe(v: object) -> str:
    """Neutralize spreadsheet formula injection (OWASP): prefix risky leading chars with a quote."""
    s = "" if v is None else str(v)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def _month_bounds(month: str) -> tuple[datetime, datetime]:
    try:
        year, mon = (int(x) for x in month.split("-", 1))
        start = datetime(year, mon, 1, tzinfo=timezone.utc)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM") from e
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc) if mon == 12 else datetime(year, mon + 1, 1, tzinfo=timezone.utc)
    return start, end


@router.get("/finance/export")
def export_month(month: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    """CSV of per-case financials for cases COMPLETED in the given month (revenue recognized on completion)."""
    _ = admin
    start, end = _month_bounds(month)

    completed = (
        select(CaseStatusHistory.case_id)
        .where(
            CaseStatusHistory.to_status == CaseStatus.completed.value,
            CaseStatusHistory.created_at >= start,
            CaseStatusHistory.created_at < end,
        )
        .distinct()
        .subquery()
    )
    rows = db.execute(
        select(Case, Customer)
        .join(Customer, Customer.id == Case.customer_id)
        .join(completed, completed.c.case_id == Case.id)
        .order_by(Case.reference_number.asc())
    ).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "reference_number", "customer", "contract_total", "revenue_ex_gst", "gst",
        "cost", "margin", "margin_pct", "total_received", "balance_due",
    ])
    for case, customer in rows:
        f = compute_case_financials(db, case)
        writer.writerow([
            _csv_safe(case.reference_number), _csv_safe(customer.nickname),
            f"{f.contract_total:.2f}", f"{f.revenue_ex_gst:.2f}",
            f"{f.gst:.2f}", f"{f.cost:.2f}", f"{f.margin:.2f}", f"{f.margin_pct:.1f}",
            f"{f.total_received:.2f}", f"{f.balance_due:.2f}",
        ])

    buf.seek(0)
    filename = f"finance-{month}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
