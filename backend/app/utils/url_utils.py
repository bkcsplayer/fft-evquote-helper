from __future__ import annotations

from urllib.parse import urlparse

from fastapi import Request


def is_local_url(url: str | None) -> bool:
    if not url:
        return False
    try:
        u = urlparse(str(url))
        host = (u.hostname or "").lower()
        return host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local")
    except Exception:
        return False


def public_base_url(*, request: Request | None, configured_url: str | None) -> str:
    """
    Best-effort public base URL (scheme + host).

    - Prefer configured_url if it's not local.
    - Otherwise, use request host/proto if it's not local.
    - Finally, fall back to configured_url (may be empty/local in dev).
    """
    configured = str(configured_url or "").rstrip("/")
    if configured and not is_local_url(configured):
        return configured

    if request is not None:
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "").strip()
        host = (
            request.headers.get("x-forwarded-host")
            or request.headers.get("host")
            or request.url.netloc
            or ""
        ).strip()
        if proto and host:
            candidate = f"{proto}://{host}".rstrip("/")
            if not is_local_url(candidate):
                return candidate

    return configured

