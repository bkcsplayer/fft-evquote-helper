from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Case, Quote
from app.schemas.schemas import QuoteApproveIn, QuoteOut
from app.config import get_settings
from app.services.notification_service import notify_case_status_sms
from app.services.quote_service import approve_quote_by_token


router = APIRouter()


@router.get("/quotes/view/{token}", response_model=QuoteOut)
def view_quote(token: str, db: Session = Depends(get_db)):
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Invalid token")

    quote = (
        db.execute(select(Quote).where(Quote.case_id == case.id, Quote.is_active.is_(True)).limit(1))
        .scalar_one_or_none()
    )
    if not quote:
        raise HTTPException(status_code=404, detail="No active quote")

    quote.addons  # ensure loaded
    _ = quote.signature
    return quote


@router.post("/quotes/approve/{token}", response_model=QuoteOut)
def approve_quote(token: str, payload: QuoteApproveIn, request: Request, db: Session = Depends(get_db)):
    if not payload.agreed:
        raise HTTPException(status_code=400, detail="Must agree to terms")

    ip = request.client.host if request.client else None
    quote = approve_quote_by_token(
        db,
        case_token=token,
        signed_name=payload.signed_name,
        signature_data=payload.signature_data,
        ip_address=ip,
    )
    # Send status update SMS (customer approved)
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if case and case.customer and case.customer.phone:
        settings = get_settings()
        status_url = f"{settings.frontend_url}/quote/status/{case.access_token}"
        notify_case_status_sms(
            db,
            case_id=str(case.id),
            to_phone=case.customer.phone,
            nickname=case.customer.nickname,
            reference_number=case.reference_number,
            status=case.status.value,
            status_url=status_url,
            note="Quote approved",
        )
        db.commit()
    quote.addons
    _ = quote.signature
    return quote

