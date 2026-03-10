from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import (
    AdminUser,
    Case,
    CaseStatus,
    CaseStatusHistory,
    Installation,
    Permit,
    PermitStatus,
    Quote,
    Survey,
)


router = APIRouter(prefix="/admin")


@router.get("/dashboard/stats")
def stats(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    pending = db.execute(select(func.count()).select_from(Case).where(Case.status == CaseStatus.pending)).scalar_one()
    to_quote = db.execute(
        select(func.count()).select_from(Case).where(Case.status.in_([CaseStatus.survey_completed, CaseStatus.quoting]))
    ).scalar_one()
    quoted_waiting = db.execute(
        select(func.count()).select_from(Case).where(Case.status == CaseStatus.quoted)
    ).scalar_one()
    installing = db.execute(
        select(func.count()).select_from(Case).where(Case.status == CaseStatus.installation_scheduled)
    ).scalar_one()

    now = datetime.now(timezone.utc)
    week_end = now + timedelta(days=7)
    surveys_this_week = db.execute(
        select(func.count())
        .select_from(Survey)
        .where(Survey.scheduled_date.is_not(None), Survey.scheduled_date >= now, Survey.scheduled_date <= week_end)
    ).scalar_one()

    # Operational counters
    reported_unpaid = db.execute(
        select(func.count(func.distinct(CaseStatusHistory.case_id)))
        .select_from(CaseStatusHistory)
        .join(Survey, Survey.case_id == CaseStatusHistory.case_id)
        .where(CaseStatusHistory.note == "Customer reported e-transfer sent", Survey.deposit_paid.is_(False))
    ).scalar_one()

    completion_email_pending = db.execute(
        select(func.count())
        .select_from(Installation)
        .where(Installation.completed_at.is_not(None), Installation.completion_email_sent.is_(False))
    ).scalar_one()

    permits_revision_required = db.execute(
        select(func.count()).select_from(Permit).where(Permit.status == PermitStatus.revision_required)
    ).scalar_one()

    def _month_start(dt: datetime) -> datetime:
        return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def _next_month_start(dt: datetime) -> datetime:
        # dt is already the first day-of-month at 00:00
        if dt.month == 12:
            return dt.replace(year=dt.year + 1, month=1)
        return dt.replace(month=dt.month + 1)

    def _quarter_start(dt: datetime) -> datetime:
        q_month = ((dt.month - 1) // 3) * 3 + 1
        return dt.replace(month=q_month, day=1, hour=0, minute=0, second=0, microsecond=0)

    def _next_quarter_start(dt: datetime) -> datetime:
        # dt is already quarter start (month=1/4/7/10, day=1 00:00)
        if dt.month == 10:
            return dt.replace(year=dt.year + 1, month=1)
        return dt.replace(month=dt.month + 3)

    month_start = _month_start(now)
    month_end = _next_month_start(month_start)
    quarter_start = _quarter_start(now)
    quarter_end = _next_quarter_start(quarter_start)

    def _completed_in_range(start: datetime, end: datetime):
        base = (
            select(func.distinct(CaseStatusHistory.case_id).label("case_id"))
            .where(
                CaseStatusHistory.to_status == CaseStatus.completed.value,
                CaseStatusHistory.created_at >= start,
                CaseStatusHistory.created_at < end,
            )
            .subquery()
        )
        completed_count = db.execute(select(func.count()).select_from(base)).scalar_one()
        revenue = db.execute(
            select(func.coalesce(func.sum(Quote.total), 0))
            .select_from(base)
            .join(Quote, (Quote.case_id == base.c.case_id) & (Quote.is_active.is_(True)))
        ).scalar_one()
        return completed_count, float(revenue or 0)

    completed_month_count, revenue_month = _completed_in_range(month_start, month_end)
    completed_quarter_count, revenue_quarter = _completed_in_range(quarter_start, quarter_end)

    status_rows = (
        db.execute(select(Case.status, func.count()).select_from(Case).group_by(Case.status).order_by(Case.status.asc()))
        .all()
    )
    status_counts: dict[str, int] = {}
    for st, cnt in status_rows:
        if st is None:
            continue
        status_counts[str(st.value if hasattr(st, "value") else st)] = int(cnt or 0)

    return {
        "pending_cases": pending,
        "cases_to_quote": to_quote,
        "quoted_waiting_approval": quoted_waiting,
        "installations_scheduled": installing,
        "surveys_next_7_days": surveys_this_week,
        "surveys_reported_unpaid": reported_unpaid,
        "installations_completed_email_pending": completion_email_pending,
        "permits_revision_required": permits_revision_required,
        "revenue_month": revenue_month,
        "revenue_quarter": revenue_quarter,
        "completed_month_count": completed_month_count,
        "completed_quarter_count": completed_quarter_count,
        "status_counts": status_counts,
    }


@router.get("/dashboard/recent-activity")
def recent_activity(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin), limit: int = 25):
    _ = admin
    rows = (
        db.execute(select(CaseStatusHistory).order_by(CaseStatusHistory.created_at.desc()).limit(min(limit, 100)))
        .scalars()
        .all()
    )
    return [
        {
            "case_id": r.case_id,
            "from_status": r.from_status,
            "to_status": r.to_status,
            "note": r.note,
            "changed_by": r.changed_by,
            "created_at": r.created_at,
        }
        for r in rows
    ]

