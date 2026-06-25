from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import (
    AdminUser,
    AttachmentCategory,
    Case,
    CaseAttachment,
    Installation,
    InstallationPhoto,
    Permit,
    PermitAttachment,
    Survey,
    SurveyPhoto,
)

router = APIRouter(prefix="/admin")

UPLOAD_DIR = Path("uploads") / "case_attachments"
MAX_BYTES = 25 * 1024 * 1024  # 25 MB ceiling for docs/photos
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".doc", ".docx", ".xls", ".xlsx", ".txt"}


def _norm(*, id_, category, file_path, original_name, caption, source, created_at, deletable):
    return {
        "id": str(id_),
        "category": category,
        "file_path": file_path,
        "original_name": original_name,
        "caption": caption,
        "source": source,
        "created_at": created_at,
        "deletable": deletable,
    }


@router.get("/cases/{case_id}/attachments")
def list_attachments(case_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    """Unified view: case_attachments + live survey/permit/installation files, grouped by category."""
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    items: list[dict] = []

    for a in db.execute(
        select(CaseAttachment).where(CaseAttachment.case_id == case.id).order_by(CaseAttachment.created_at.desc())
    ).scalars():
        items.append(_norm(
            id_=a.id, category=a.category.value, file_path=a.file_path, original_name=a.original_name,
            caption=a.caption, source="case_attachment", created_at=a.created_at, deletable=True,
        ))

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if survey:
        for p in db.execute(select(SurveyPhoto).where(SurveyPhoto.survey_id == survey.id)).scalars():
            items.append(_norm(
                id_=p.id, category="survey_photo", file_path=p.file_path, original_name=p.file_name,
                caption=p.caption or p.category.value, source="survey_photo", created_at=p.created_at, deletable=False,
            ))

    permit = db.execute(select(Permit).where(Permit.case_id == case.id)).scalar_one_or_none()
    if permit:
        for pa in db.execute(select(PermitAttachment).where(PermitAttachment.permit_id == permit.id)).scalars():
            items.append(_norm(
                id_=pa.id, category="permit_doc", file_path=pa.file_path, original_name=pa.file_name,
                caption=None, source="permit_attachment", created_at=pa.created_at, deletable=False,
            ))

    inst = db.execute(select(Installation).where(Installation.case_id == case.id)).scalar_one_or_none()
    if inst:
        for ip in db.execute(select(InstallationPhoto).where(InstallationPhoto.installation_id == inst.id)).scalars():
            items.append(_norm(
                id_=ip.id, category="installation_photo", file_path=ip.file_path, original_name=ip.file_name,
                caption=ip.caption, source="installation_photo", created_at=ip.created_at, deletable=False,
            ))

    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return items


@router.post("/cases/{case_id}/attachments")
async def upload_attachment(
    case_id: str,
    category: AttachmentCategory = AttachmentCategory.other,
    caption: str | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    """Upload a document/photo into the case attachment store (permit docs, contracts, invoices, etc.)."""
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")

    ext = Path(file.filename or "").suffix[:10]
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not permitted")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{case.id}_{uuid.uuid4().hex}{ext}"
    rel_path = UPLOAD_DIR / safe_name
    with open(rel_path, "wb") as f:
        f.write(content)

    row = CaseAttachment(
        case_id=case.id,
        category=category,
        file_path=str(rel_path).replace("\\", "/"),
        original_name=file.filename or safe_name,
        mime_type=file.content_type,
        size_bytes=len(content),
        caption=(caption or None),
        uploaded_by=admin.id,
        source_table=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _norm(
        id_=row.id, category=row.category.value, file_path=row.file_path, original_name=row.original_name,
        caption=row.caption, source="case_attachment", created_at=row.created_at, deletable=True,
    )


@router.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(get_current_admin)):
    """Delete a case_attachments row. Legacy survey/permit/installation files are managed in their own sections."""
    _ = admin
    row = db.get(CaseAttachment, attachment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found (legacy files are deleted from their own section)")
    try:
        if row.file_path and os.path.exists(row.file_path):
            os.remove(row.file_path)
    except OSError as exc:
        logger.warning("Could not delete attachment file %s: %s", row.file_path, exc)
    db.delete(row)
    db.commit()
    return {"ok": True}
