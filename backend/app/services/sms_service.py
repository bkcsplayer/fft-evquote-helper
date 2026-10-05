from __future__ import annotations

from app.config import get_settings


def send_sms(*, to_phone: str, body: str) -> None:
    settings = get_settings()
    # Fail-closed (ADR-020): with NOTIFY_REDIRECT=on only the redirect target may receive SMS, so a
    # call site that bypasses notification_service._apply_redirect fails loudly instead of delivering.
    if (settings.notify_redirect or "").strip().casefold() == "on" and (
        to_phone.strip().casefold() != settings.nudge_redirect_sms.strip().casefold()
    ):
        raise RuntimeError("NOTIFY_REDIRECT=on: refusing to text a non-redirect recipient")
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number):
        raise RuntimeError("Twilio not configured")

    from twilio.rest import Client

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    client.messages.create(to=to_phone, from_=settings.twilio_phone_number, body=body)

