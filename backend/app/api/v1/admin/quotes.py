from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser, Case, Customer, Quote
from app.schemas.schemas import QuoteCreateIn, QuoteOut
from app.services.notification_service import (
    notify_email,
    notify_sms,
    render_email_from_db_or_files,
    render_sms_from_db_or_fallback,
)
from app.services.quote_service import create_quote, mark_quote_sent
from app.utils.url_utils import public_base_url


router = APIRouter(prefix="/admin")


@router.post("/cases/{case_id}/quotes", response_model=QuoteOut)
def admin_create_quote(
    case_id: str,
    payload: QuoteCreateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    quote = create_quote(db, case_id=case_id, created_by=str(admin.id), payload=payload.model_dump())
    quote.addons
    _ = quote.signature
    return quote


@router.get("/cases/{case_id}/quotes", response_model=list[QuoteOut])
def admin_list_quotes(
    case_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    quotes = (
        db.execute(select(Quote).where(Quote.case_id == case.id).order_by(Quote.version.desc()))
        .scalars()
        .all()
    )
    for q in quotes:
        q.addons
        _ = q.signature
    return quotes


@router.post("/quotes/{quote_id}/send", response_model=QuoteOut)
def admin_send_quote(
    quote_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    quote = mark_quote_sent(db, quote_id=quote_id, changed_by=str(admin.id))
    quote.addons
    _ = quote.signature

    settings = get_settings()
    case = db.get(Case, quote.case_id)
    if case:
        customer = db.get(Customer, case.customer_id)
        if customer:
            public_base = public_base_url(request=request, configured_url=settings.frontend_url)
            quote_url = f"{public_base}/quote/view/{case.access_token}"
            ctx = {
                "title": "FFT - Quote ready",
                "nickname": customer.nickname,
                "reference_number": case.reference_number,
                "quote_url": quote_url,
            }
            subject, html = render_email_from_db_or_files(
                db,
                template_key="quote_ready",
                ctx=ctx,
                fallback_file="quote_ready.html",
                fallback_subject="Your EV charger installation quote is ready",
            )
            notify_email(
                db,
                case_id=str(case.id),
                to_email=customer.email,
                template_name="quote_ready",
                subject=subject,
                html=html,
            )
            sms = render_sms_from_db_or_fallback(
                db,
                template_key="quote_ready",
                ctx=ctx,
                fallback="{{ brand_name }}\nQuote ready for review\nCase: {{ reference_number }}\nView: {{ quote_url }}",
            )
            notify_sms(
                db,
                case_id=str(case.id),
                to_phone=customer.phone,
                template_name="quote_ready",
                body=sms,
            )
            db.commit()

    return quote


@router.get("/quotes/{quote_id}/preview")
def preview_quote(
    quote_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(get_current_admin),
):
    _ = admin
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    quote.addons
    _ = quote.signature
    case = db.get(Case, quote.case_id)
    customer = db.get(Customer, case.customer_id) if case else None
    from app.services.notification_service import render_template

    html = render_template(
        "quote_preview.html",
        {
            "quote": quote,
            "case": case,
            "customer": customer,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        },
    )
    return {"html": html}

