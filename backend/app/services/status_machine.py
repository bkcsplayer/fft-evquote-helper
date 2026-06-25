from __future__ import annotations

from fastapi import HTTPException

from app.models.models import CaseStatus


# Any non-terminal state may also be cancelled (admin abort) or marked lost (customer declined).
_EXIT = {CaseStatus.cancelled, CaseStatus.lost}

ALLOWED_TRANSITIONS: dict[CaseStatus, set[CaseStatus]] = {
    CaseStatus.pending: {CaseStatus.survey_scheduled, *_EXIT},
    CaseStatus.survey_scheduled: {CaseStatus.survey_completed, *_EXIT},
    CaseStatus.survey_completed: {CaseStatus.quoting, *_EXIT},
    CaseStatus.quoting: {CaseStatus.quoted, *_EXIT},
    CaseStatus.quoted: {CaseStatus.customer_approved, CaseStatus.quoting, *_EXIT},
    CaseStatus.customer_approved: {CaseStatus.permit_applied, *_EXIT},
    CaseStatus.permit_applied: {CaseStatus.permit_approved, *_EXIT},
    CaseStatus.permit_approved: {CaseStatus.installation_scheduled, *_EXIT},
    CaseStatus.installation_scheduled: {CaseStatus.installed, *_EXIT},
    CaseStatus.installed: {CaseStatus.completed, *_EXIT},
    CaseStatus.completed: set(),
    CaseStatus.cancelled: set(),
    CaseStatus.lost: set(),
}


def assert_transition_allowed(*, from_status: CaseStatus, to_status: CaseStatus) -> None:
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition: {from_status.value} -> {to_status.value}",
        )

