from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Case, Quote
from app.schemas.schemas import QuoteApproveIn, QuoteOut
from app.config import get_settings
from app.services.notification_service import notify_admin_event, notify_case_status_sms
from app.services.quote_service import approve_quote_by_token
from app.utils.url_utils import public_base_url


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
    language = (payload.language or "").strip().lower() or None
    if language not in {None, "en", "zh"}:
        language = None
    quote = approve_quote_by_token(
        db,
        case_token=token,
        signed_name=payload.signed_name,
        signature_data=payload.signature_data,
        ip_address=ip,
        signed_language=language,
        terms_snapshot=(payload.terms_text or None),
    )
    # Send status update SMS (customer approved) + notify admin of the approval
    case = db.execute(select(Case).where(Case.access_token == token)).scalar_one_or_none()
    if case:
        if case.customer and case.customer.phone:
            settings = get_settings()
            public_base = public_base_url(request=request, configured_url=settings.frontend_url)
            status_url = f"{public_base}/quote/status/{case.access_token}"
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
        notify_admin_event(
            db,
            case_id=str(case.id),
            reference_number=case.reference_number,
            event_key="admin_quote_approved",
            heading="Customer approved & signed the quote",
            summary="A customer accepted the terms and signed the quote.",
            customer_nickname=case.customer.nickname if case.customer else None,
            customer_phone=case.customer.phone if case.customer else None,
            customer_email=case.customer.email if case.customer else None,
            extra_lines=[
                f"Signed by: {payload.signed_name}",
                *( [f"Language: {language}"] if language else [] ),
            ],
        )
        db.commit()
    quote.addons
    _ = quote.signature
    return quote

