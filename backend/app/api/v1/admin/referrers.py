from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus


router = APIRouter(prefix="/admin")


@router.get("/referrers/stats")
def referrers_stats(db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin

    # total leads per referrer
    leads = (
        db.execute(
            select(Case.referrer, func.count().label("leads"))
            .where(Case.referrer.is_not(None))
            .group_by(Case.referrer)
            .order_by(func.count().desc())
        )
        .all()
    )

    # conversions: completed installs per referrer
    conversions = dict(
        db.execute(
            select(Case.referrer, func.count().label("completed"))
            .where(Case.referrer.is_not(None), Case.status == CaseStatus.completed)
            .group_by(Case.referrer)
        ).all()
    )

    out = []
    for ref, cnt in leads:
        completed = int(conversions.get(ref, 0))
        rate = float(completed) / float(cnt) if cnt else 0.0
        out.append({"referrer": ref, "leads": int(cnt), "completed": completed, "conversion_rate": rate})
    return out

