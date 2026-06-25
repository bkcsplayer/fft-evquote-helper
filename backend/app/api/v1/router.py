from fastapi import APIRouter

from app.api.v1.admin import attachments as admin_attachments
from app.api.v1.admin import auth as admin_auth
from app.api.v1.admin import bom as admin_bom
from app.api.v1.admin import cases as admin_cases
from app.api.v1.admin import case_extras as admin_case_extras
from app.api.v1.admin import dashboard as admin_dashboard
from app.api.v1.admin import finance as admin_finance
from app.api.v1.admin import installations as admin_installations
from app.api.v1.admin import materials as admin_materials
from app.api.v1.admin import payments as admin_payments
from app.api.v1.admin import permits as admin_permits
from app.api.v1.admin import quotes as admin_quotes
from app.api.v1.admin import referrers as admin_referrers
from app.api.v1.admin import settings as admin_settings
from app.api.v1.admin import surveys as admin_surveys
from app.api.v1.admin import surveys_photos as admin_surveys_photos
from app.api.v1.admin import users as admin_users
from app.api.v1.public import charger_brands, cases, payments, quotes, survey_photos


api_router = APIRouter(prefix="/api/v1")

# Public
api_router.include_router(charger_brands.router, tags=["public"])
api_router.include_router(cases.router, tags=["public"])
api_router.include_router(quotes.router, tags=["public"])
api_router.include_router(payments.router, tags=["public"])
api_router.include_router(survey_photos.router, tags=["public"])

# Admin
api_router.include_router(admin_auth.router, tags=["admin"])
api_router.include_router(admin_cases.router, tags=["admin"])
api_router.include_router(admin_case_extras.router, tags=["admin"])
api_router.include_router(admin_dashboard.router, tags=["admin"])
api_router.include_router(admin_installations.router, tags=["admin"])
api_router.include_router(admin_permits.router, tags=["admin"])
api_router.include_router(admin_quotes.router, tags=["admin"])
api_router.include_router(admin_referrers.router, tags=["admin"])
api_router.include_router(admin_settings.router, tags=["admin"])
api_router.include_router(admin_surveys.router, tags=["admin"])
api_router.include_router(admin_surveys_photos.router, tags=["admin"])
api_router.include_router(admin_users.router, tags=["admin"])
api_router.include_router(admin_attachments.router, tags=["admin"])
api_router.include_router(admin_payments.router, tags=["admin"])
api_router.include_router(admin_materials.router, tags=["admin"])
api_router.include_router(admin_bom.router, tags=["admin"])
api_router.include_router(admin_finance.router, tags=["admin"])

