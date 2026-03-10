from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, CaseStatus, Survey, SurveyPhoto, SurveyPhotoCategory
from app.schemas.schemas import SurveyPhotoOut


router = APIRouter(prefix="/admin")


class SurveyPhotoUploadIn(BaseModel):
    category: SurveyPhotoCategory
    caption: str | None = None


UPLOAD_DIR = Path("uploads") / "survey_photos"


@router.post("/cases/{case_id}/survey/photos", response_model=SurveyPhotoOut)
async def upload_survey_photo(
    case_id: str,
    category: SurveyPhotoCategory,
    caption: str | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        raise HTTPException(status_code=400, detail="Survey not created yet")

    # Workflow guard: survey photos are editable only until permit work starts.
    if case.status not in {
        CaseStatus.survey_completed,
        CaseStatus.quoting,
        CaseStatus.quoted,
        CaseStatus.customer_approved,
    }:
        raise HTTPException(status_code=400, detail="Survey photos are locked after permit starts")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "").suffix[:10]
    safe_name = f"{survey.id}_{uuid.uuid4().hex}{ext}"
    rel_path = UPLOAD_DIR / safe_name

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    with open(rel_path, "wb") as f:
        f.write(content)

    row = SurveyPhoto(
        survey_id=survey.id,
        category=category,
        file_path=str(rel_path).replace("\\", "/"),
        file_name=file.filename or safe_name,
        caption=caption,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/cases/{case_id}/survey/photos", response_model=list[SurveyPhotoOut])
def list_survey_photos(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        return []
    photos = (
        db.execute(select(SurveyPhoto).where(SurveyPhoto.survey_id == survey.id).order_by(SurveyPhoto.created_at.desc()))
        .scalars()
        .all()
    )
    return photos


@router.delete("/survey/photos/{photo_id}")
def delete_survey_photo(
    photo_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    photo = db.get(SurveyPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    survey = db.get(Survey, photo.survey_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    case = db.get(Case, survey.case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if case.status not in {
        CaseStatus.survey_completed,
        CaseStatus.quoting,
        CaseStatus.quoted,
        CaseStatus.customer_approved,
    }:
        raise HTTPException(status_code=400, detail="Survey photos are locked after permit starts")

    # best-effort remove file
    try:
        if photo.file_path and os.path.exists(photo.file_path):
            os.remove(photo.file_path)
    except Exception:
        pass

    db.delete(photo)
    db.commit()
    return {"ok": True}

