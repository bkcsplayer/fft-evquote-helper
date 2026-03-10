from __future__ import annotations

from app.config import get_settings


def send_sms(*, to_phone: str, body: str) -> None:
    settings = get_settings()
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_phone_number):
        raise RuntimeError("Twilio not configured")

    from twilio.rest import Client

    client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
    client.messages.create(to=to_phone, from_=settings.twilio_phone_number, body=body)

