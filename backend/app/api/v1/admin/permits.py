from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, CaseStatusHistory, Customer, Installation, Permit, PermitAttachment
from app.schemas.schemas import PermitIn, PermitListItemOut, PermitOut
from app.config import get_settings
from app.services.notification_service import (
    notify_case_status_sms,
    notify_email,
    notify_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)
from app.services.status_machine import assert_transition_allowed


router = APIRouter(prefix="/admin")

UPLOAD_DIR = Path("uploads") / "permit_attachments"


class PermitStatusUpdateIn(BaseModel):
    status: str
    note: str | None = None


@router.get("/permits", response_model=list[PermitListItemOut])
def list_permits(
    status: str | None = None,
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    stmt = (
        select(Permit, Case, Customer)
        .join(Case, Case.id == Permit.case_id)
        .join(Customer, Customer.id == Case.customer_id)
        .order_by(Permit.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if status:
        stmt = stmt.where(Permit.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Case.reference_number.ilike(like),
                Case.install_address.ilike(like),
                Customer.nickname.ilike(like),
                Permit.permit_number.ilike(like),
            )
        )

    rows = db.execute(stmt).all()
    out: list[PermitListItemOut] = []
    for permit, case, customer in rows:
        out.append(
            PermitListItemOut(
                id=permit.id,
                case_id=case.id,
                reference_number=case.reference_number,
                case_status=case.status,
                customer_nickname=customer.nickname,
                install_address=case.install_address,
                permit_number=permit.permit_number,
                status=permit.status,
                applied_date=permit.applied_date,
                expected_approval_date=permit.expected_approval_date,
                actual_approval_date=permit.actual_approval_date,
            )
        )
    return out


@router.get("/permits/{permit_id}", response_model=PermitOut)
def get_permit(
    permit_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    permit = db.get(Permit, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    permit.attachments
    return permit


@router.get("/cases/{case_id}/permit", response_model=PermitOut | None)
def get_permit_by_case(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    permit = db.execute(select(Permit).where(Permit.case_id == case.id)).scalar_one_or_none()
    if not permit:
        return None
    permit.attachments
    return permit


@router.post("/cases/{case_id}/permit", response_model=PermitOut)
def create_or_update_permit(
    case_id: str,
    payload: PermitIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Workflow guard: permit work only after customer approved the quote (or later)
    if case.status not in {
        CaseStatus.customer_approved,
        CaseStatus.permit_applied,
        CaseStatus.permit_approved,
        CaseStatus.installation_scheduled,
        CaseStatus.installed,
        CaseStatus.completed,
    }:
        raise HTTPException(status_code=400, detail="Permit is locked until customer approves the quote")

    permit = db.execute(select(Permit).where(Permit.case_id == case.id)).scalar_one_or_none()
    if not permit:
        permit = Permit(case_id=case.id)
        db.add(permit)
        db.flush()

    permit.permit_number = payload.permit_number
    permit.applied_date = payload.applied_date
    permit.expected_approval_date = payload.expected_approval_date
    permit.actual_approval_date = payload.actual_approval_date
    permit.status = payload.status
    permit.notes = payload.notes
    db.add(permit)

    # status transitions: customer_approved -> permit_applied -> permit_approved
    did_change_status = False
    became_installation_scheduled = False
    if case.status == CaseStatus.customer_approved:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.permit_applied)
        from_status = case.status.value
        case.status = CaseStatus.permit_applied
        did_change_status = True
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.permit_applied.value,
                changed_by=admin.id,
                note="Permit created/updated",
            )
        )

    if payload.status == payload.status.approved and case.status == CaseStatus.permit_applied:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.permit_approved)
        from_status = case.status.value
        case.status = CaseStatus.permit_approved
        did_change_status = True
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.permit_approved.value,
                changed_by=admin.id,
                note="Permit approved",
            )
        )

        # If an installation date was already planned, auto-confirm scheduling now that permit is approved
        inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
        if inst and inst.scheduled_date:
            assert_transition_allowed(from_status=case.status, to_status=CaseStatus.installation_scheduled)
            from2 = case.status.value
            case.status = CaseStatus.installation_scheduled
            became_installation_scheduled = True
            db.add(case)
            db.add(
                CaseStatusHistory(
                    case_id=case.id,
                    from_status=from2,
                    to_status=CaseStatus.installation_scheduled.value,
                    changed_by=admin.id,
                    note="Installation scheduled (permit approved)",
                )
            )

    db.commit()

    # Notify customer if status changed
    if did_change_status:
        customer = db.get(Customer, case.customer_id)
        if customer and customer.phone:
            settings = get_settings()
            status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
            notify_case_status_sms(
                db,
                case_id=str(case.id),
                to_phone=customer.phone,
                nickname=customer.nickname,
                reference_number=case.reference_number,
                status=case.status.value,
                status_url=status_url,
                note="Permit updated" if not became_installation_scheduled else "Permit approved; installation scheduled",
            )
            db.commit()
    db.refresh(permit)
    permit.attachments
    return permit


@router.patch("/permits/{permit_id}", response_model=PermitOut)
def patch_permit(
    permit_id: str,
    payload: PermitIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    permit = db.get(Permit, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")

    permit.permit_number = payload.permit_number
    permit.applied_date = payload.applied_date
    permit.expected_approval_date = payload.expected_approval_date
    permit.actual_approval_date = payload.actual_approval_date
    permit.status = payload.status
    permit.notes = payload.notes
    db.add(permit)
    db.commit()
    db.refresh(permit)
    permit.attachments
    return permit


@router.patch("/permits/{permit_id}/status", response_model=PermitOut)
def patch_permit_status(
    permit_id: str,
    payload: PermitStatusUpdateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    permit = db.get(Permit, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    case = db.get(Case, permit.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    desired = str(payload.status or "").strip()
    if desired not in {"applied", "approved", "revision_required"}:
        raise HTTPException(status_code=400, detail="Invalid permit status")

    # Workflow guard: permit work only after customer approved the quote (or later)
    if case.status not in {
        CaseStatus.customer_approved,
        CaseStatus.permit_applied,
        CaseStatus.permit_approved,
        CaseStatus.installation_scheduled,
        CaseStatus.installed,
        CaseStatus.completed,
    }:
        raise HTTPException(status_code=400, detail="Permit is locked until customer approves the quote")

    # Do not allow downgrading once approved (keeps the workflow consistent)
    if case.status in {CaseStatus.permit_approved, CaseStatus.installation_scheduled, CaseStatus.installed, CaseStatus.completed} and desired != "approved":
        raise HTTPException(status_code=400, detail="Cannot downgrade permit after it is approved")

    permit.status = desired  # stored as enum-compatible string
    db.add(permit)

    did_change_case_status = False
    note = payload.note or "Permit updated"

    # customer_approved -> permit_applied when permit work starts
    if case.status == CaseStatus.customer_approved:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.permit_applied)
        from_status = case.status.value
        case.status = CaseStatus.permit_applied
        did_change_case_status = True
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.permit_applied.value,
                changed_by=admin.id,
                note="Permit created/updated",
            )
        )

    # permit_applied -> permit_approved when status becomes approved
    became_installation_scheduled = False
    if desired == "approved" and case.status == CaseStatus.permit_applied:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.permit_approved)
        from_status = case.status.value
        case.status = CaseStatus.permit_approved
        did_change_case_status = True
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.permit_approved.value,
                changed_by=admin.id,
                note="Permit approved",
            )
        )

        # If an installation date was already planned, auto-confirm scheduling now that permit is approved
        inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
        if inst and inst.scheduled_date:
            assert_transition_allowed(from_status=case.status, to_status=CaseStatus.installation_scheduled)
            from2 = case.status.value
            case.status = CaseStatus.installation_scheduled
            became_installation_scheduled = True
            db.add(case)
            db.add(
                CaseStatusHistory(
                    case_id=case.id,
                    from_status=from2,
                    to_status=CaseStatus.installation_scheduled.value,
                    changed_by=admin.id,
                    note="Installation scheduled (permit approved)",
                )
            )

    db.commit()

    # Notify customer (always on manual status update)
    customer = db.get(Customer, case.customer_id)
    if customer:
        settings = get_settings()
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        ctx = {
            "title": "FFT - Permit update",
            "nickname": customer.nickname,
            "reference_number": case.reference_number,
            "permit_status": desired,
            "status_url": status_url,
            "note": note,
        }
        subject, html = render_email_from_db_or_files(
            db,
            template_key="permit_status_update",
            ctx=ctx,
            fallback_file="permit_status_update.html",
            fallback_subject=f"Permit status update: {desired}",
        )
        notify_email(
            db,
            case_id=str(case.id),
            to_email=customer.email,
            template_name="permit_status_update",
            subject=subject,
            html=html,
        )
        sms = render_sms_from_db_or_fallback(
            db,
            template_key="permit_status_update",
            ctx=ctx,
            fallback="[FFT] Permit status: {{ permit_status }} ({{ reference_number }}). {{ status_url }}",
        )
        notify_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            template_name="permit_status_update",
            body=sms,
        )
        if customer.phone and (did_change_case_status or payload.note):
            notify_case_status_sms(
                db,
                case_id=str(case.id),
                to_phone=customer.phone,
                nickname=customer.nickname,
                reference_number=case.reference_number,
                status=case.status.value,
                status_url=status_url,
                note=note if not became_installation_scheduled else "Permit approved; installation can be scheduled",
            )
        db.commit()

    db.refresh(permit)
    permit.attachments
    return permit


@router.post("/permits/{permit_id}/attachments")
async def upload_permit_attachment(
    permit_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    permit = db.get(Permit, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    case = db.get(Case, permit.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status not in {
        CaseStatus.customer_approved,
        CaseStatus.permit_applied,
        CaseStatus.permit_approved,
        CaseStatus.installation_scheduled,
        CaseStatus.installed,
        CaseStatus.completed,
    }:
        raise HTTPException(status_code=400, detail="Permit attachments are locked until customer approves the quote")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix[:10]
    safe_name = f"{permit.id}_{uuid.uuid4().hex}{ext}"
    rel_path = UPLOAD_DIR / safe_name
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    with open(rel_path, "wb") as f:
        f.write(content)

    row = PermitAttachment(
        permit_id=permit.id,
        file_path=str(rel_path).replace("\\", "/"),
        file_name=file.filename or safe_name,
    )
    db.add(row)
    db.commit()
    return {"ok": True, "id": str(row.id), "file_path": row.file_path}


@router.delete("/permits/attachments/{attachment_id}")
def delete_permit_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    att = db.get(PermitAttachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    try:
        if att.file_path and os.path.exists(att.file_path):
            os.remove(att.file_path)
    except Exception:
        pass
    db.delete(att)
    db.commit()
    return {"ok": True}

