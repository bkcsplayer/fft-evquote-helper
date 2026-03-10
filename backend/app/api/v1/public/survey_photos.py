from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Case, Survey, SurveyPhoto
from app.schemas.schemas import SurveyPhotoOut


router = APIRouter()


@router.get("/cases/survey/photos/{token}", response_model=list[SurveyPhotoOut])
def public_list_survey_photos(token: str, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    survey = db.execute(select(Survey).where(Survey.case_id == case.id)).scalar_one_or_none()
    if not survey:
        return []

    photos = (
        db.execute(select(SurveyPhoto).where(SurveyPhoto.survey_id == survey.id).order_by(SurveyPhoto.created_at.desc()))
        .scalars()
        .all()
    )
    # Avoid ORM->Pydantic serialization issues
    return [SurveyPhotoOut.model_validate(p, from_attributes=True) for p in photos]

