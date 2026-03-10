from __future__ import annotations

import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.database import SessionLocal
from app.services.bootstrap_service import ensure_defaults
from app.services.data_fix_service import repair_charger_brand_seed


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers["x-request-id"] = rid
        return response


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="FFT EV Charger Quote API", version="0.1.0")

    allow_origins = [o for o in [settings.frontend_url, settings.admin_url] if o]
    if settings.app_env == "development" and not allow_origins:
        allow_origins = ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)

    app.include_router(api_router)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.on_event("startup")
    def _bootstrap():
        with SessionLocal() as db:
            ensure_defaults(db)
            repair_charger_brand_seed(db)

    return app


app = create_app()

