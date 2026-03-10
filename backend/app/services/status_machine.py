from __future__ import annotations

from fastapi import HTTPException

from app.models.models import CaseStatus


ALLOWED_TRANSITIONS: dict[CaseStatus, set[CaseStatus]] = {
    CaseStatus.pending: {CaseStatus.survey_scheduled, CaseStatus.cancelled},
    CaseStatus.survey_scheduled: {CaseStatus.survey_completed, CaseStatus.cancelled},
    CaseStatus.survey_completed: {CaseStatus.quoting, CaseStatus.cancelled},
    CaseStatus.quoting: {CaseStatus.quoted, CaseStatus.cancelled},
    CaseStatus.quoted: {CaseStatus.customer_approved, CaseStatus.quoting, CaseStatus.cancelled},
    CaseStatus.customer_approved: {CaseStatus.permit_applied, CaseStatus.cancelled},
    CaseStatus.permit_applied: {CaseStatus.permit_approved, CaseStatus.cancelled},
    CaseStatus.permit_approved: {CaseStatus.installation_scheduled, CaseStatus.cancelled},
    CaseStatus.installation_scheduled: {CaseStatus.installed, CaseStatus.cancelled},
    CaseStatus.installed: {CaseStatus.completed, CaseStatus.cancelled},
    CaseStatus.completed: set(),
    CaseStatus.cancelled: set(),
}


def assert_transition_allowed(*, from_status: CaseStatus, to_status: CaseStatus) -> None:
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition: {from_status.value} -> {to_status.value}",
        )

