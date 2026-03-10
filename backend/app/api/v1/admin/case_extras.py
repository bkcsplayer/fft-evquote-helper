from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseNote, CaseStatusHistory, Notification, NotificationChannel
from app.services.email_service import send_email


router = APIRouter(prefix="/admin")


class NoteCreateIn(BaseModel):
    content: str


class NotificationResendIn(BaseModel):
    to_email: str | None = None


@router.get("/cases/{case_id}/timeline")
def timeline(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = (
        db.execute(select(CaseStatusHistory).where(CaseStatusHistory.case_id == case.id).order_by(CaseStatusHistory.created_at.asc()))
        .scalars()
        .all()
    )
    return [
        {
            "id": r.id,
            "from_status": r.from_status,
            "to_status": r.to_status,
            "changed_by": r.changed_by,
            "note": r.note,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.get("/cases/{case_id}/notifications")
def notifications(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = (
        db.execute(select(Notification).where(Notification.case_id == case.id).order_by(Notification.created_at.desc()))
        .scalars()
        .all()
    )
    return [
        {
            "id": n.id,
            "channel": n.channel.value,
            "recipient": n.recipient,
            "template_name": n.template_name,
            "subject": n.subject,
            "status": n.status.value,
            "sent_at": n.sent_at,
            "error_message": n.error_message,
            "created_at": n.created_at,
        }
        for n in rows
    ]


@router.post("/notifications/{notification_id}/resend")
def resend_notification_email(
    notification_id: str,
    payload: NotificationResendIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    n = db.get(Notification, notification_id)
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.channel != NotificationChannel.email:
        raise HTTPException(status_code=400, detail="Only email notifications can be resent")
    if not n.subject or not n.content:
        raise HTTPException(status_code=400, detail="Email content missing")
    to_email = (payload.to_email or n.recipient or "").strip()
    if not to_email:
        raise HTTPException(status_code=400, detail="Recipient email required")

    # Best-effort resend (does not replace history record; this is a manual action)
    try:
        send_email(to_email=to_email, subject=n.subject, html=n.content)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Resend failed: {e}") from e

    return {"ok": True, "to": to_email}


@router.post("/cases/{case_id}/notes")
def add_note(
    case_id: str,
    payload: NoteCreateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    note = CaseNote(case_id=case.id, admin_user_id=admin.id, content=payload.content)
    db.add(note)
    db.commit()
    return {"ok": True, "id": str(note.id)}


@router.get("/cases/{case_id}/notes")
def list_notes(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    rows = (
        db.execute(select(CaseNote).where(CaseNote.case_id == case.id).order_by(CaseNote.created_at.desc()))
        .scalars()
        .all()
    )
    return [
        {
            "id": n.id,
            "admin_user_id": n.admin_user_id,
            "content": n.content,
            "created_at": n.created_at,
        }
        for n in rows
    ]

