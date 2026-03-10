from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.middleware.auth import get_current_admin
from app.models.models import AdminUser
from app.schemas.schemas import AdminLoginIn, AdminMeOut, AdminTokenOut
from app.services.security import create_admin_access_token, verify_password


router = APIRouter(prefix="/admin")


@dataclass
class _Bucket:
    first_ts: float
    fails: int
    blocked_until: float


_buckets: dict[str, _Bucket] = {}


def _key(ip: str | None, username: str) -> str:
    return f"{ip or 'unknown'}::{username.lower().strip()}"


def _record_fail(settings, k: str, now: float) -> None:
    b = _buckets.get(k)
    if not b:
        _buckets[k] = _Bucket(first_ts=now, fails=1, blocked_until=0)
        return

    if now - b.first_ts > settings.admin_login_window_seconds:
        b.first_ts = now
        b.fails = 1
        b.blocked_until = 0
        _buckets[k] = b
        return

    b.fails += 1
    if b.fails >= settings.admin_login_max_attempts:
        b.blocked_until = now + settings.admin_login_block_seconds
    _buckets[k] = b


@router.post("/auth/login", response_model=AdminTokenOut)
def login(payload: AdminLoginIn, request: Request, db: Session = Depends(get_db)):
    settings = get_settings()
    now = time.time()
    ip = request.client.host if request.client else None
    k = _key(ip, payload.username)
    b = _buckets.get(k)
    if b and b.blocked_until > now:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")

    admin = db.execute(select(AdminUser).where(AdminUser.username == payload.username)).scalar_one_or_none()
    if not admin or not admin.is_active:
        _record_fail(settings, k, now)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, admin.password_hash):
        _record_fail(settings, k, now)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    _buckets.pop(k, None)
    token = create_admin_access_token(subject=str(admin.id), role=admin.role.value)
    return AdminTokenOut(access_token=token)


@router.get("/auth/me", response_model=AdminMeOut)
def me(admin: AdminUser = Depends(get_current_admin)):
    return AdminMeOut(id=admin.id, username=admin.username, email=admin.email, role=admin.role.value)

