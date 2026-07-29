from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.services.nudge_service import run_daily_nudges

router = APIRouter(prefix="/internal")


@router.post("/nudges/run")
def run_nudges(
    db: Session = Depends(get_db),
    x_nudge_key: str | None = Header(default=None, alias="X-Nudge-Key"),
):
    # No `now` query/body param on purpose — never let a caller pass one in.
    # run_daily_nudges() compares a caller-supplied `now` (used for stalled-days math) against
    # notifications.created_at, a real DB wall-clock column that today's-digest / per-target
    # idempotency checks query by Calgary calendar day. Those two checks are only the same clock
    # when now == real wall-clock time. A "convenient for testing" now param here would turn a
    # theoretical dual-clock mismatch into a real one — duplicate/missed sends in production.
    settings = get_settings()
    if not settings.nudge_run_key:
        raise HTTPException(status_code=503, detail="Nudges are not configured")
    if not hmac.compare_digest(x_nudge_key or "", settings.nudge_run_key):
        raise HTTPException(status_code=401, detail="Invalid key")
    return run_daily_nudges(db)
