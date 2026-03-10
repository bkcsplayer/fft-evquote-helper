from __future__ import annotations

import re
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from html import unescape

from app.config import get_settings


def _html_to_text(html: str) -> str:
    if not html:
        return ""
    s = str(html)
    # Drop scripts/styles
    s = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", s)
    # Breaks
    s = re.sub(r"(?i)<br\\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p\\s*>", "\n\n", s)
    s = re.sub(r"(?i)</div\\s*>", "\n", s)
    s = re.sub(r"(?i)</li\\s*>", "\n", s)
    # Strip tags
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    # Unescape HTML entities
    s = unescape(s)
    # Normalize whitespace
    s = re.sub(r"[ \\t\\r\\f\\v]+", " ", s)
    s = re.sub(r"\\n\\s+", "\n", s)
    s = re.sub(r"\\n{3,}", "\n\n", s)
    return s.strip()


def send_email(*, to_email: str, subject: str, html: str) -> None:
    settings = get_settings()
    if not (settings.smtp_host and settings.smtp_port):
        raise RuntimeError("SMTP not configured")

    from_email = (settings.smtp_from_email or settings.smtp_user or "").strip()
    if not from_email:
        raise RuntimeError("SMTP_FROM_EMAIL or SMTP_USER must be set (used as From address)")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or 'FFT'} <{from_email}>"
    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)
    # Some providers spam-score emails missing Message-ID/Date/plaintext.
    msg["Message-ID"] = make_msgid(domain=from_email.split("@", 1)[1] if "@" in from_email else None)

    text = _html_to_text(html) or f"{subject}\n"
    msg.set_content(text, subtype="plain", charset="utf-8")
    msg.add_alternative(html or "", subtype="html", charset="utf-8")

    smtp_cls = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    with smtp_cls(settings.smtp_host, int(settings.smtp_port), timeout=20) as server:
        server.ehlo()
        if not settings.smtp_use_ssl and settings.smtp_starttls:
            server.starttls()
            server.ehlo()
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        refused = server.send_message(msg, from_addr=from_email, to_addrs=[to_email])
        if refused:
            raise RuntimeError(f"SMTP refused recipients: {refused}")

