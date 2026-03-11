from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, CaseStatusHistory, Customer, Installation, InstallationPhoto
from app.schemas.schemas import InstallationOut, InstallationPhotoOut, InstallationScheduleIn
from app.services.notification_service import (
    notify_email,
    notify_sms,
    notify_case_status_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)
from app.services.status_machine import assert_transition_allowed
from app.utils.url_utils import public_base_url


router = APIRouter(prefix="/admin")

UPLOAD_DIR = Path("uploads") / "installation_photos"


class InstallationCompleteIn(BaseModel):
    notes: str | None = None


class InstallationReportIn(BaseModel):
    installed_items: str | None = None
    wire_gauge: str | None = None
    max_charging_amps: int | None = None
    test_passed: bool | None = None
    test_notes: str | None = None


class InstallationRequestRejectIn(BaseModel):
    note: str | None = None


@router.get("/cases/{case_id}/installation", response_model=InstallationOut | None)
def get_installation_by_case(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    return inst


@router.patch("/cases/{case_id}/installation/report", response_model=InstallationOut)
def update_installation_report(
    case_id: str,
    payload: InstallationReportIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status not in {
        CaseStatus.installation_scheduled,
        CaseStatus.installed,
        CaseStatus.completed,
    }:
        raise HTTPException(status_code=400, detail="Installation report is locked until installation is scheduled")

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        inst = Installation(case_id=case.id, completion_email_sent=False)
        db.add(inst)
        db.flush()

    if payload.installed_items is not None:
        inst.installed_items = payload.installed_items
    if payload.wire_gauge is not None:
        inst.wire_gauge = payload.wire_gauge
    if payload.max_charging_amps is not None:
        inst.max_charging_amps = payload.max_charging_amps
    if payload.test_passed is not None:
        inst.test_passed = payload.test_passed
    if payload.test_notes is not None:
        inst.test_notes = payload.test_notes

    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


@router.post("/cases/{case_id}/installation/photos", response_model=InstallationPhotoOut)
async def upload_installation_photo(
    case_id: str,
    caption: str | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status not in {
        CaseStatus.installation_scheduled,
        CaseStatus.installed,
        CaseStatus.completed,
    }:
        raise HTTPException(status_code=400, detail="Installation photos are locked until installation is scheduled")

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=400, detail="Installation not scheduled")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix[:10]
    safe_name = f"{inst.id}_{uuid.uuid4().hex}{ext}"
    rel_path = UPLOAD_DIR / safe_name
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    with open(rel_path, "wb") as f:
        f.write(content)

    row = InstallationPhoto(
        installation_id=inst.id,
        file_path=str(rel_path).replace("\\", "/"),
        file_name=file.filename or safe_name,
        caption=caption,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return InstallationPhotoOut.model_validate(row, from_attributes=True)


@router.get("/cases/{case_id}/installation/photos", response_model=list[InstallationPhotoOut])
def list_installation_photos(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        return []
    photos = (
        db.execute(
            select(InstallationPhoto)
            .where(InstallationPhoto.installation_id == inst.id)
            .order_by(InstallationPhoto.created_at.desc())
        )
        .scalars()
        .all()
    )
    return [InstallationPhotoOut.model_validate(p, from_attributes=True) for p in photos]


@router.delete("/installation/photos/{photo_id}")
def delete_installation_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    photo = db.get(InstallationPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # best-effort remove file
    try:
        if photo.file_path and os.path.exists(photo.file_path):
            os.remove(photo.file_path)
    except Exception:
        pass

    db.delete(photo)
    db.commit()
    return {"ok": True}


@router.post("/cases/{case_id}/installation/report/send")
def send_installation_report(
    case_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status not in {CaseStatus.installed, CaseStatus.completed}:
        raise HTTPException(status_code=400, detail="Installation report can be sent after installation is completed")

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=400, detail="Installation not found")

    customer = db.get(Customer, case.customer_id)
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    settings = get_settings()
    public_base = public_base_url(request=request, configured_url=settings.frontend_url)
    status_url = f"{public_base}/quote/status/{case.access_token}"
    photos = (
        db.execute(
            select(InstallationPhoto)
            .where(InstallationPhoto.installation_id == inst.id)
            .order_by(InstallationPhoto.created_at.desc())
        )
        .scalars()
        .all()
    )
    photo_urls = [
        {
            "url": f"{public_base}/{str(p.file_path).lstrip('/')}",
            "file_name": p.file_name,
            "caption": p.caption,
        }
        for p in photos
    ]

    ctx = {
        "title": "FFT - Installation & test report",
        "nickname": customer.nickname,
        "reference_number": case.reference_number,
        "install_address": case.install_address,
        "status_url": status_url,
        "scheduled_date": inst.scheduled_date,
        "completed_at": inst.completed_at,
        "installed_items": inst.installed_items,
        "wire_gauge": inst.wire_gauge,
        "max_charging_amps": inst.max_charging_amps,
        "test_passed": inst.test_passed,
        "test_notes": inst.test_notes,
        "photos": photo_urls,
    }
    subject, html = render_email_from_db_or_files(
        db,
        template_key="installation_report",
        ctx=ctx,
        fallback_file="installation_report.html",
        fallback_subject="Installation & test report",
    )
    notify_email(
        db,
        case_id=str(case.id),
        to_email=customer.email,
        template_name="installation_report",
        subject=subject,
        html=html,
    )
    sms = render_sms_from_db_or_fallback(
        db,
        template_key="installation_report",
        ctx=ctx,
        fallback="{{ brand_name }}\nInstallation report ready\nCase: {{ reference_number }}\nView: {{ status_url }}",
    )
    notify_sms(
        db,
        case_id=str(case.id),
        to_phone=customer.phone,
        template_name="installation_report",
        body=sms,
    )
    if customer.phone:
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note="Installation report sent",
        )
    db.commit()
    return {"ok": True}


@router.post("/cases/{case_id}/installation/schedule", response_model=InstallationOut)
def schedule_installation(
    case_id: str,
    request: Request,
    payload: InstallationScheduleIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    # Workflow guard: scheduling requires permit approval (or later)
    if case.status not in {
        CaseStatus.permit_approved,
        CaseStatus.installation_scheduled,
    }:
        raise HTTPException(status_code=400, detail="Installation is locked until permit is approved")

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        inst = Installation(case_id=case.id, completion_email_sent=False)
        db.add(inst)
        db.flush()

    # Handshake guard: before completion, admin can only schedule by confirming
    # the customer's pending requested time.
    if not inst.completed_at:
        if not inst.requested_date or (inst.request_status or "").strip() != "pending":
            raise HTTPException(
                status_code=400,
                detail="Customer must request an installation time before admin can confirm it",
            )
        try:
            diff = abs((payload.scheduled_date - inst.requested_date).total_seconds())
        except Exception:
            diff = 999999
        if diff > 60:
            raise HTTPException(
                status_code=400,
                detail="Scheduled time must match the customer's requested time. Reject the request and ask the customer to choose again.",
            )
        inst.request_status = "accepted"
        inst.admin_note = None

    # Prevent illogical states:
    # - After completion, allow only "backdating" schedule (fixing a wrong future appointment)
    if inst.completed_at:
        if not payload.scheduled_date:
            raise HTTPException(status_code=400, detail="Scheduled date is required")
        if payload.scheduled_date > inst.completed_at:
            raise HTTPException(
                status_code=400,
                detail="Cannot schedule after completion. Choose a time on or before the completed time.",
            )
    if case.status in {CaseStatus.installed, CaseStatus.completed} and not inst.completed_at:
        raise HTTPException(status_code=400, detail="Cannot schedule after installation is completed")

    inst.scheduled_date = payload.scheduled_date
    inst.notes = payload.notes
    db.add(inst)

    # Advance status permit_approved -> installation_scheduled
    if case.status == CaseStatus.permit_approved:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.installation_scheduled)
        from_status = case.status.value
        case.status = CaseStatus.installation_scheduled
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.installation_scheduled.value,
                changed_by=admin.id,
                note="Installation scheduled",
            )
        )
    else:
        note = "Installation re-scheduled"
        if inst.completed_at:
            note = "Installation schedule corrected (post-completion)"
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=case.status.value,
                to_status=case.status.value,
                changed_by=admin.id,
                note=note,
            )
        )

    db.commit()

    # Notify customer
    customer = db.get(Customer, case.customer_id)
    if customer:
        settings = get_settings()
        public_base = public_base_url(request=request, configured_url=settings.frontend_url)
        status_url = f"{public_base}/quote/status/{case.access_token}"
        scheduled_text = payload.scheduled_date.astimezone().strftime("%Y-%m-%d %H:%M %Z")
        ctx = {
            "title": "FFT - Installation scheduled",
            "nickname": customer.nickname,
            "reference_number": case.reference_number,
            "scheduled_text": scheduled_text,
            "status_url": status_url,
        }
        subject, html = render_email_from_db_or_files(
            db,
            template_key="installation_scheduled",
            ctx=ctx,
            fallback_file="installation_scheduled.html",
            fallback_subject="Your EV charger installation is scheduled",
        )
        notify_email(
            db,
            case_id=str(case.id),
            to_email=customer.email,
            template_name="installation_scheduled",
            subject=subject,
            html=html,
        )
        sms = render_sms_from_db_or_fallback(
            db,
            template_key="installation_scheduled",
            ctx=ctx,
            fallback="{{ brand_name }}\nInstallation scheduled\nTime: {{ scheduled_text }}\nCase: {{ reference_number }}\nTrack: {{ status_url }}",
        )
        notify_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            template_name="installation_scheduled",
            body=sms,
        )
        db.commit()

    db.refresh(inst)
    return inst


@router.post("/cases/{case_id}/installation/request/reject")
def reject_installation_request(
    case_id: str,
    request: Request,
    payload: InstallationRequestRejectIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status != CaseStatus.permit_approved:
        raise HTTPException(
            status_code=400,
            detail="Installation request can only be rejected before installation is scheduled",
        )

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst or not inst.requested_date or (inst.request_status or "").strip() != "pending":
        raise HTTPException(status_code=400, detail="No pending installation request to reject")

    note = (payload.note or "").strip() or "Requested time not available. Please choose another time."
    inst.request_status = "rejected"
    inst.admin_note = note
    db.add(inst)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=case.status.value if case.status else None,
            to_status=case.status.value if case.status else "pending",
            changed_by=admin.id,
            note=f"Installation time rejected: {note}",
        )
    )
    db.commit()

    customer = db.get(Customer, case.customer_id)
    if customer and customer.phone:
        settings = get_settings()
        public_base = public_base_url(request=request, configured_url=settings.frontend_url)
        status_url = f"{public_base}/quote/status/{case.access_token}"
        ctx = {
            "title": "Installation time update needed",
            "nickname": customer.nickname,
            "reference_number": case.reference_number,
            "status_url": status_url,
            "note": note,
        }
        sms = render_sms_from_db_or_fallback(
            db,
            template_key="installation_time_action_required",
            ctx=ctx,
            fallback=(
                "{{ brand_name }}\n"
                "ACTION REQUIRED: Please choose a new installation time.\n"
                "Case: {{ reference_number }}\n"
                "{% if note %}Reason: {{ note }}\n{% endif %}"
                "Track: {{ status_url }}"
            ),
        )
        notify_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            template_name="installation_time_action_required",
            body=sms,
        )
        db.commit()

    return {"ok": True}


@router.patch("/cases/{case_id}/installation/complete", response_model=InstallationOut)
def complete_installation(
    case_id: str,
    request: Request,
    payload: InstallationCompleteIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=400, detail="Installation not scheduled")

    now = datetime.now(timezone.utc)
    if inst.scheduled_date and now < inst.scheduled_date:
        raise HTTPException(
            status_code=400,
            detail="Cannot mark installed before the scheduled time. Update the schedule first.",
        )

    inst.completed_at = now
    if payload.notes:
        inst.notes = payload.notes
    db.add(inst)

    assert_transition_allowed(from_status=case.status, to_status=CaseStatus.installed)
    from_status = case.status.value
    case.status = CaseStatus.installed
    db.add(case)
    db.add(
        CaseStatusHistory(
            case_id=case.id,
            from_status=from_status,
            to_status=CaseStatus.installed.value,
            changed_by=admin.id,
            note="Installation completed",
        )
    )
    db.commit()
    # Notify customer about status update
    customer = db.get(Customer, case.customer_id)
    if customer and customer.phone:
        settings = get_settings()
        public_base = public_base_url(request=request, configured_url=settings.frontend_url)
        status_url = f"{public_base}/quote/status/{case.access_token}"
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=customer.phone,
            nickname=customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note="Installation completed",
        )
        db.commit()
    db.refresh(inst)
    return inst


@router.post("/cases/{case_id}/completion-email")
def send_completion_email(
    case_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=400, detail="Installation not found")

    customer = db.get(Customer, case.customer_id)
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found")

    already_completed = case.status == CaseStatus.completed

    settings = get_settings()
    public_base = public_base_url(request=request, configured_url=settings.frontend_url)
    status_url = f"{public_base}/quote/status/{case.access_token}"
    completed_text = None
    if inst.completed_at:
        try:
            completed_text = inst.completed_at.astimezone().strftime("%Y-%m-%d %H:%M %Z")
        except Exception:
            completed_text = str(inst.completed_at)

    ctx = {
        "title": "FFT - Project completed",
        "nickname": customer.nickname,
        "reference_number": case.reference_number,
        "status_url": status_url,
        "completed_text": completed_text,
    }
    subject, html = render_email_from_db_or_files(
        db,
        template_key="completion",
        ctx=ctx,
        fallback_file="completion.html",
        fallback_subject="Your EV charger installation is completed",
    )
    notify_email(
        db,
        case_id=str(case.id),
        to_email=customer.email,
        template_name="completion",
        subject=subject,
        html=html,
    )
    sms = render_sms_from_db_or_fallback(
        db,
        template_key="completion",
        ctx=ctx,
        fallback="{{ brand_name }}\nInstallation complete\nCase: {{ reference_number }}\nThank you!",
    )
    notify_sms(
        db,
        case_id=str(case.id),
        to_phone=customer.phone,
        template_name="completion",
        body=sms,
    )
    inst.completion_email_sent = True
    db.add(inst)

    if already_completed:
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=case.status.value,
                to_status=case.status.value,
                changed_by=admin.id,
                note="Completion email re-sent",
            )
        )
    else:
        assert_transition_allowed(from_status=case.status, to_status=CaseStatus.completed)
        from_status = case.status.value
        case.status = CaseStatus.completed
        db.add(case)
        db.add(
            CaseStatusHistory(
                case_id=case.id,
                from_status=from_status,
                to_status=CaseStatus.completed.value,
                changed_by=admin.id,
                note="Completion email sent",
            )
        )
    db.commit()
    return {"ok": True}


@router.get("/installations/calendar")
def installations_calendar(
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    rows = db.execute(
        select(Installation, Case, Customer)
        .join(Case, Case.id == Installation.case_id)
        .join(Customer, Customer.id == Case.customer_id)
        .where(
            Installation.scheduled_date.is_not(None),
            Installation.scheduled_date >= start,
            Installation.scheduled_date <= end,
        )
        .order_by(Installation.scheduled_date.asc())
    ).all()
    out = []
    for inst, case, customer in rows:
        out.append(
            {
                "case_id": str(case.id),
                "case_status": case.status.value if case.status else None,
                "reference_number": case.reference_number,
                "customer_nickname": customer.nickname,
                "install_address": case.install_address,
                "scheduled_date": inst.scheduled_date,
                "completed_at": inst.completed_at,
                "completion_email_sent": inst.completion_email_sent,
                "notes": inst.notes,
            }
        )
    return out

