from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_super_admin
from app.models.models import AdminUser
from app.schemas.schemas import AdminUserCreateIn, AdminUserOut
from app.services.security import hash_password


router = APIRouter(prefix="/admin")


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db), admin: AdminUser = Depends(require_super_admin)):
    _ = admin
    rows = db.execute(select(AdminUser).order_by(AdminUser.created_at.desc())).scalars().all()
    return [
        {
            "id": r.id,
            "username": r.username,
            "email": r.email,
            "role": r.role.value,
            "is_active": r.is_active,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.post("/users", response_model=AdminUserOut)
def create_user(payload: AdminUserCreateIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_super_admin)):
    _ = admin
    exists = db.execute(select(AdminUser).where(AdminUser.username == payload.username)).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Username already exists")
    exists_email = db.execute(select(AdminUser).where(AdminUser.email == payload.email)).scalar_one_or_none()
    if exists_email:
        raise HTTPException(status_code=409, detail="Email already exists")

    row = AdminUser(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "username": row.username,
        "email": row.email,
        "role": row.role.value,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: str,
    payload: AdminUserCreateIn,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_super_admin),
):
    _ = admin
    row = db.get(AdminUser, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    row.username = payload.username
    row.email = payload.email
    row.role = payload.role
    row.is_active = payload.is_active
    if payload.password:
        row.password_hash = hash_password(payload.password)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "username": row.username,
        "email": row.email,
        "role": row.role.value,
        "is_active": row.is_active,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), admin: AdminUser = Depends(require_super_admin)):
    _ = admin
    row = db.get(AdminUser, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(row)
    db.commit()
    return {"ok": True}

