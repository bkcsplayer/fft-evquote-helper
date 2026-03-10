from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.models import AdminRole, CaseStatus, InstallType, PermitStatus, SurveyPhotoCategory


class ChargerBrandOut(BaseModel):
    id: UUID
    name: str
    sort_order: int


class CustomerCreate(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=7, max_length=20)
    email: EmailStr


class CaseCreate(BaseModel):
    customer: CustomerCreate
    charger_brand: str
    ev_brand: str
    install_address: str
    pickup_date: date | None = None
    preferred_install_date: date | None = None
    referrer: str | None = None
    preferred_survey_slots: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None


class CaseSubmittedOut(BaseModel):
    reference_number: str
    access_token: str
    status: CaseStatus


class CaseStatusOut(BaseModel):
    reference_number: str
    status: CaseStatus
    created_at: datetime
    updated_at: datetime
    survey_scheduled_date: datetime | None = None
    survey_deposit_paid: bool | None = None
    survey_deposit_amount: Decimal | None = None
    quote_active_id: UUID | None = None


class QuoteAddonIn(BaseModel):
    name: str
    price: Decimal
    description: str | None = None


class QuoteCreateIn(BaseModel):
    install_type: InstallType
    base_price: Decimal
    extra_distance_meters: Decimal = Decimal("0")
    extra_distance_rate: Decimal = Decimal("0")
    permit_fee: Decimal = Decimal("349.00")
    survey_credit: Decimal = Decimal("0")
    gst_rate: Decimal = Decimal("5.00")
    customer_notes: str | None = None
    admin_notes: str | None = None
    addons: list[QuoteAddonIn] = Field(default_factory=list)


class QuoteAddonOut(BaseModel):
    id: UUID
    name: str
    price: Decimal
    description: str | None = None


class QuoteSignatureOut(BaseModel):
    signed_name: str
    signed_at: datetime
    signature_data: str
    ip_address: str | None = None


class QuoteOut(BaseModel):
    id: UUID
    case_id: UUID
    version: int
    install_type: InstallType
    base_price: Decimal
    extra_distance_meters: Decimal
    extra_distance_rate: Decimal
    extra_distance_cost: Decimal
    permit_fee: Decimal
    survey_credit: Decimal
    subtotal: Decimal
    gst_rate: Decimal
    gst_amount: Decimal
    total: Decimal
    customer_notes: str | None = None
    sent_at: datetime | None = None
    is_active: bool
    addons: list[QuoteAddonOut] = []
    signature: QuoteSignatureOut | None = None


class QuoteApproveIn(BaseModel):
    agreed: bool
    signed_name: str
    signature_data: str


class AdminLoginIn(BaseModel):
    username: str
    password: str


class AdminTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AdminMeOut(BaseModel):
    id: UUID
    username: str
    email: str
    role: str


class CaseListItemOut(BaseModel):
    id: UUID
    reference_number: str
    status: CaseStatus
    customer_nickname: str
    phone: str
    email: str
    install_address: str
    created_at: datetime


class CaseDetailOut(BaseModel):
    id: UUID
    reference_number: str
    status: CaseStatus
    access_token: str
    charger_brand: str
    ev_brand: str
    install_address: str
    pickup_date: date | None
    preferred_install_date: date | None
    referrer: str | None
    preferred_survey_slots: dict[str, Any]
    notes: str | None
    created_at: datetime
    updated_at: datetime

    customer: CustomerCreate
    survey_scheduled_date: datetime | None = None
    survey_deposit_paid: bool | None = None
    survey_deposit_amount: Decimal | None = None
    active_quote: QuoteOut | None = None


class SurveyPhotoOut(BaseModel):
    id: UUID
    category: SurveyPhotoCategory
    file_path: str
    file_name: str
    caption: str | None = None
    created_at: datetime


class PermitIn(BaseModel):
    permit_number: str | None = None
    applied_date: date | None = None
    expected_approval_date: date | None = None
    actual_approval_date: date | None = None
    status: PermitStatus = PermitStatus.applied
    notes: str | None = None


class PermitAttachmentOut(BaseModel):
    id: UUID
    file_path: str
    file_name: str
    created_at: datetime


class PermitOut(BaseModel):
    id: UUID
    case_id: UUID
    permit_number: str | None
    applied_date: date | None
    expected_approval_date: date | None
    actual_approval_date: date | None
    status: PermitStatus
    notes: str | None
    attachments: list[PermitAttachmentOut] = []


class PermitListItemOut(BaseModel):
    id: UUID
    case_id: UUID
    reference_number: str
    case_status: CaseStatus
    customer_nickname: str
    install_address: str
    permit_number: str | None
    status: PermitStatus
    applied_date: date | None
    expected_approval_date: date | None
    actual_approval_date: date | None


class InstallationScheduleIn(BaseModel):
    scheduled_date: datetime
    notes: str | None = None


class InstallationOut(BaseModel):
    id: UUID
    case_id: UUID
    scheduled_date: datetime | None
    completed_at: datetime | None
    completion_email_sent: bool
    notes: str | None
    installed_items: str | None = None
    wire_gauge: str | None = None
    max_charging_amps: int | None = None
    test_passed: bool
    test_notes: str | None = None


class InstallationPhotoOut(BaseModel):
    id: UUID
    file_path: str
    file_name: str
    caption: str | None = None
    created_at: datetime


class SettingsOut(BaseModel):
    key: str
    value: dict[str, Any]


class SettingsPutIn(BaseModel):
    value: dict[str, Any]


class ChargerBrandIn(BaseModel):
    name: str
    sort_order: int = 0
    is_active: bool = True


class AdminUserCreateIn(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: AdminRole = AdminRole.admin
    is_active: bool = True


class AdminUserOut(BaseModel):
    id: UUID
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CaseStatusPatchIn(BaseModel):
    to_status: CaseStatus
    note: str | None = None

