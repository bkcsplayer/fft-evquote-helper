from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CaseStatus(str, enum.Enum):
    pending = "pending"
    survey_scheduled = "survey_scheduled"
    survey_completed = "survey_completed"
    quoting = "quoting"
    quoted = "quoted"
    customer_approved = "customer_approved"
    permit_applied = "permit_applied"
    permit_approved = "permit_approved"
    installation_scheduled = "installation_scheduled"
    installed = "installed"
    completed = "completed"
    cancelled = "cancelled"


class AdminRole(str, enum.Enum):
    admin = "admin"
    super_admin = "super_admin"


class SurveyPhotoCategory(str, enum.Enum):
    panel_front = "panel_front"
    panel_inside = "panel_inside"
    meter = "meter"
    install_location = "install_location"
    wiring_path = "wiring_path"
    other = "other"


class InstallType(str, enum.Enum):
    surface_mount = "surface_mount"
    concealed = "concealed"


class PermitStatus(str, enum.Enum):
    applied = "applied"
    approved = "approved"
    revision_required = "revision_required"


class NotificationChannel(str, enum.Enum):
    email = "email"
    sms = "sms"


class NotificationStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Customer(Base, TimestampMixin):
    __tablename__ = "customers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nickname: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    cases: Mapped[list["Case"]] = relationship(back_populates="customer")


class Case(Base, TimestampMixin):
    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customers.id"))
    status: Mapped[CaseStatus] = mapped_column(Enum(CaseStatus, name="case_status"), nullable=False)

    charger_brand: Mapped[str] = mapped_column(String(100), nullable=False)
    ev_brand: Mapped[str] = mapped_column(String(100), nullable=False)
    install_address: Mapped[str] = mapped_column(Text, nullable=False)
    pickup_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    preferred_install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    referrer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    preferred_survey_slots: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    access_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    customer: Mapped["Customer"] = relationship(back_populates="cases")
    status_history: Mapped[list["CaseStatusHistory"]] = relationship(back_populates="case")
    survey: Mapped["Survey | None"] = relationship(back_populates="case")
    quotes: Mapped[list["Quote"]] = relationship(back_populates="case")
    permit: Mapped["Permit | None"] = relationship(back_populates="case")
    installation: Mapped["Installation | None"] = relationship(back_populates="case")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="case")
    notes_internal: Mapped[list["CaseNote"]] = relationship(back_populates="case")


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[AdminRole] = mapped_column(Enum(AdminRole, name="admin_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CaseStatusHistory(Base):
    __tablename__ = "case_status_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped["Case"] = relationship(back_populates="status_history")


class Survey(Base, TimestampMixin):
    __tablename__ = "surveys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), unique=True)
    scheduled_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    deposit_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=99.00)
    deposit_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    stripe_payment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    survey_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="survey")
    photos: Mapped[list["SurveyPhoto"]] = relationship(back_populates="survey")


class SurveyPhoto(Base):
    __tablename__ = "survey_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    survey_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("surveys.id"), index=True)
    category: Mapped[SurveyPhotoCategory] = mapped_column(
        Enum(SurveyPhotoCategory, name="survey_photo_category"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    survey: Mapped["Survey"] = relationship(back_populates="photos")


class Quote(Base, TimestampMixin):
    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)

    version: Mapped[int] = mapped_column(Integer, nullable=False)
    install_type: Mapped[InstallType] = mapped_column(Enum(InstallType, name="install_type"), nullable=False)
    base_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    extra_distance_meters: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False, default=0)
    extra_distance_rate: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    extra_distance_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    permit_fee: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=349.00)
    survey_credit: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    gst_rate: Mapped[float] = mapped_column(Numeric(4, 2), nullable=False, default=5.00)
    gst_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"))

    case: Mapped["Case"] = relationship(back_populates="quotes")
    addons: Mapped[list["QuoteAddon"]] = relationship(back_populates="quote")
    signature: Mapped["QuoteSignature | None"] = relationship(back_populates="quote")


class QuoteAddon(Base):
    __tablename__ = "quote_addons"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("quotes.id"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    quote: Mapped["Quote"] = relationship(back_populates="addons")


class QuoteSignature(Base):
    __tablename__ = "quote_signatures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), unique=True, index=True
    )
    signature_data: Mapped[str] = mapped_column(Text, nullable=False)
    signed_name: Mapped[str] = mapped_column(String(255), nullable=False)
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    quote: Mapped["Quote"] = relationship(back_populates="signature")


class Permit(Base, TimestampMixin):
    __tablename__ = "permits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), unique=True)
    permit_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    applied_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[PermitStatus] = mapped_column(
        Enum(PermitStatus, name="permit_status"), nullable=False, default=PermitStatus.applied
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="permit")
    attachments: Mapped[list["PermitAttachment"]] = relationship(back_populates="permit")


class PermitAttachment(Base):
    __tablename__ = "permit_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    permit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("permits.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    permit: Mapped["Permit"] = relationship(back_populates="attachments")


class Installation(Base, TimestampMixin):
    __tablename__ = "installations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), unique=True)
    scheduled_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_email_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Installation completion report fields (admin-entered)
    installed_items: Mapped[str | None] = mapped_column(Text, nullable=True)
    wire_gauge: Mapped[str | None] = mapped_column(String(50), nullable=True)
    max_charging_amps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    test_passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    test_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="installation")
    photos: Mapped[list["InstallationPhoto"]] = relationship(back_populates="installation")


class InstallationPhoto(Base):
    __tablename__ = "installation_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    installation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("installations.id"), index=True
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    installation: Mapped["Installation"] = relationship(back_populates="photos")


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel, name="notification_channel"), nullable=False
    )
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    template_name: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(
        Enum(NotificationStatus, name="notification_status"),
        nullable=False,
        default=NotificationStatus.pending,
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="notifications")


class CaseNote(Base):
    __tablename__ = "case_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    admin_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_users.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    case: Mapped["Case"] = relationship(back_populates="notes_internal")


class SystemSetting(Base):
    __tablename__ = "system_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChargerBrand(Base):
    __tablename__ = "charger_brands"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

