from __future__ import annotations

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
    lost = "lost"  # customer declined / went elsewhere — distinct from admin-cancelled, for funnel win/loss


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
    load_calc: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    access_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    customer: Mapped["Customer"] = relationship(back_populates="cases")
    status_history: Mapped[list["CaseStatusHistory"]] = relationship(back_populates="case")
    survey: Mapped["Survey | None"] = relationship(back_populates="case")
    quotes: Mapped[list["Quote"]] = relationship(back_populates="case")
    permit: Mapped["Permit | None"] = relationship(back_populates="case")
    installation: Mapped["Installation | None"] = relationship(back_populates="case")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="case")
    notes_internal: Mapped[list["CaseNote"]] = relationship(back_populates="case")
    attachments: Mapped[list["CaseAttachment"]] = relationship(back_populates="case")
    payments: Mapped[list["Payment"]] = relationship(back_populates="case")
    bom_lines: Mapped[list["CaseBomLine"]] = relationship(back_populates="case")


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

    # Appointment request handshake (customer -> admin)
    requested_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    request_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    deposit_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=99.00)
    deposit_paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Customer reported they sent the e-transfer (structured flag; replaces fragile timeline string-matching).
    deposit_reported: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deposit_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    # Audit: the language the customer signed under and the exact terms text shown at signing.
    signed_language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    terms_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)

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

    # Appointment request handshake (customer -> admin)
    requested_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    request_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    # case_id nullable since v3.0 — new-service notifications target a service booking / subscription.
    case_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cases.id"), index=True, nullable=True
    )
    service_booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_bookings.id"), index=True, nullable=True
    )
    cleaning_subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cleaning_subscriptions.id"), index=True, nullable=True
    )
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


# ── Slot-based booking (replaces the survey/install propose→confirm handshake) ──
class AppointmentKind(str, enum.Enum):
    # EV (existing) — target = case
    survey = "survey"
    install = "install"
    # v3.0 new services — target = service_booking / cleaning_visit (shared capacity pool)
    diagnostic = "diagnostic"        # solar diagnostic on-site visit
    bird_survey = "bird_survey"      # bird-netting drone survey
    bird_install = "bird_install"    # bird-netting installation
    cleaning = "cleaning"            # panel-cleaning quarterly visit


class AppointmentStatus(str, enum.Enum):
    booked = "booked"
    cancelled = "cancelled"
    completed = "completed"


class Appointment(Base, TimestampMixin):
    """Polymorphic scheduling row. Exactly one target FK is set (case / service_booking /
    cleaning_visit). Capacity is a company-wide shared pool per (day, hour) — the count is
    kind-agnostic (see services/booking.py). v3.0: each appointment consumes 1 unit.
    """

    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint(
            "(case_id IS NOT NULL)::int + (service_booking_id IS NOT NULL)::int"
            " + (cleaning_visit_id IS NOT NULL)::int = 1",
            name="ck_appointments_single_target",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # EV target (nullable since v3.0 — new services target service_booking / cleaning_visit instead)
    case_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True, nullable=True)
    service_booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_bookings.id"), index=True, nullable=True
    )
    cleaning_visit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cleaning_visits.id"), index=True, nullable=True
    )
    kind: Mapped[AppointmentKind] = mapped_column(Enum(AppointmentKind, name="appointment_kind"), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"), nullable=False, default=AppointmentStatus.booked
    )
    created_by: Mapped[str] = mapped_column(String(20), nullable=False, default="customer")  # customer|admin


class AvailabilityOverride(Base):
    """Per-day or per-slot capacity override. capacity 0 = closed; > default = extra capacity."""

    __tablename__ = "availability_overrides"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hour: Mapped[int | None] = mapped_column(Integer, nullable=True)  # null = whole-day rule
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Waitlist(Base):
    """Out-of-service-area leads captured at the customer gate."""

    __tablename__ = "waitlist"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    postal: Mapped[str | None] = mapped_column(String(20), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Phase 5: Case aggregate-root extensions (attachments / payments / BOM) ──


class AttachmentCategory(str, enum.Enum):
    survey_photo = "survey_photo"
    permit_doc = "permit_doc"
    installation_photo = "installation_photo"
    signed_quote = "signed_quote"
    contract = "contract"
    invoice = "invoice"
    other = "other"


class CaseAttachment(Base, TimestampMixin):
    """Unified file store for a case — survey photos, permit docs, signed quotes, invoices, etc."""

    __tablename__ = "case_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    category: Mapped[AttachmentCategory] = mapped_column(
        Enum(AttachmentCategory, name="attachment_category"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True
    )
    # Provenance for backfilled rows: 'survey_photos' | 'permit_attachments' | 'installation_photos'.
    source_table: Mapped[str | None] = mapped_column(String(50), nullable=True)

    case: Mapped["Case"] = relationship(back_populates="attachments")


class PaymentKind(str, enum.Enum):
    deposit = "deposit"
    balance = "balance"
    refund = "refund"


class PaymentMethod(str, enum.Enum):
    etransfer = "etransfer"
    stripe = "stripe"
    cash = "cash"
    other = "other"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    received = "received"
    refunded = "refunded"


class Payment(Base, TimestampMixin):
    """Money ledger for a case (deposits, balance, refunds). Replaces fragile note-string tracking."""

    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    kind: Mapped[PaymentKind] = mapped_column(Enum(PaymentKind, name="payment_kind"), nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method"), nullable=False, default=PaymentMethod.etransfer
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), nullable=False, default=PaymentStatus.pending
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="payments")


class MaterialCategory(str, enum.Enum):
    charger = "charger"
    cable = "cable"
    breaker = "breaker"
    conduit = "conduit"
    labor = "labor"
    misc = "misc"


class MaterialCatalog(Base, TimestampMixin):
    """Reusable master list of materials/labor with default cost + sell price (Settings-managed)."""

    __tablename__ = "material_catalog"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[MaterialCategory] = mapped_column(
        Enum(MaterialCategory, name="material_category"), nullable=False, default=MaterialCategory.misc
    )
    unit: Mapped[str] = mapped_column(String(50), nullable=False, default="each")
    default_unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    default_sell_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CaseBomLine(Base, TimestampMixin):
    """A line on a case's bill of materials. unit_cost feeds financials; unit_price feeds the quote."""

    __tablename__ = "case_bom_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id"), index=True)
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_catalog.id"), nullable=True
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    case: Mapped["Case"] = relationship(back_populates="bom_lines")


# ────────────────────────────────────────────────────────────────────────────────────────
# v3.0 FutureFrontier four-service portal — new services (independent of the EV Case model).
# Diagnostic + Bird Netting share `service_bookings`; Cleaning uses subscriptions + visits.
# Scheduling for all of these reuses the generalized `Appointment` shared-capacity pool.
# ────────────────────────────────────────────────────────────────────────────────────────
class ServiceType(str, enum.Enum):
    diagnostic = "diagnostic"
    bird_netting = "bird_netting"


class ServiceBookingStatus(str, enum.Enum):
    """Union of diagnostic + bird-netting lifecycles. Valid subset depends on service_type;
    transitions are guarded in services/service_booking_flow.py.

    diagnostic:   submitted → scheduled → in_progress → completed | cancelled
    bird_netting: submitted → survey_scheduled → quoted → approved → install_scheduled
                            → completed | cancelled
    """

    submitted = "submitted"
    scheduled = "scheduled"                # diagnostic
    survey_scheduled = "survey_scheduled"  # bird netting (drone survey booked)
    quoted = "quoted"                      # bird netting
    approved = "approved"                  # bird netting (customer signed)
    in_progress = "in_progress"            # diagnostic
    install_scheduled = "install_scheduled"  # bird netting
    completed = "completed"
    cancelled = "cancelled"


class QuoteStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class CleaningTier(str, enum.Enum):
    tier1 = "tier1"    # <= tier1 max panels
    tier2 = "tier2"    # tier1_max < panels <= tier2_max
    custom = "custom"  # > tier2_max — admin sets price


class CleaningPricingStatus(str, enum.Enum):
    quoted = "quoted"                # annual_price is set
    pending_quote = "pending_quote"  # custom tier awaiting admin price


class CleaningPaymentStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"
    refunded = "refunded"


class CleaningVisitStatus(str, enum.Enum):
    pending = "pending"
    notified = "notified"
    completed = "completed"
    skipped = "skipped"


class ServiceBooking(Base, TimestampMixin):
    """One-off Diagnostic or Bird-Netting job. Independent of the EV Case model."""

    __tablename__ = "service_bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    service_type: Mapped[ServiceType] = mapped_column(Enum(ServiceType, name="service_type"), nullable=False)
    status: Mapped[ServiceBookingStatus] = mapped_column(
        Enum(ServiceBookingStatus, name="service_booking_status"),
        nullable=False,
        default=ServiceBookingStatus.submitted,
    )

    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    panel_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preferred_window: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # diagnostic-only inputs
    inverter_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    problem_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    problem_tags: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    photo_urls: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # scheduling mirror (source of truth is the active Appointment)
    technician: Mapped[str | None] = mapped_column(String(100), nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # completion (diagnostic)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    hardware_involved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completion_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # price snapshot (diagnostic hourly rate at submission time)
    hourly_rate_snapshot: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    access_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    disclaimer_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    quote: Mapped["BirdNettingQuote | None"] = relationship(back_populates="booking")


class BirdNettingQuote(Base, TimestampMixin):
    """Drone-survey-based quote for a bird-netting booking. Prices are snapshotted at quote time."""

    __tablename__ = "bird_netting_quotes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_bookings.id"), unique=True, index=True, nullable=False
    )
    roll_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    nest_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    roll_price_snapshot: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    nest_fee_snapshot: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    status: Mapped[QuoteStatus] = mapped_column(
        Enum(QuoteStatus, name="quote_status"), nullable=False, default=QuoteStatus.pending
    )
    signature_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    signed_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    booking: Mapped["ServiceBooking"] = relationship(back_populates="quote")


class CleaningSubscription(Base, TimestampMixin):
    """Annual panel-cleaning subscription (4 quarterly visits). No online payment in v3.0."""

    __tablename__ = "cleaning_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reference_number: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    panel_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tier: Mapped[CleaningTier] = mapped_column(Enum(CleaningTier, name="cleaning_tier"), nullable=False)
    annual_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    pricing_status: Mapped[CleaningPricingStatus] = mapped_column(
        Enum(CleaningPricingStatus, name="cleaning_pricing_status"),
        nullable=False,
        default=CleaningPricingStatus.quoted,
    )
    payment_status: Mapped[CleaningPaymentStatus] = mapped_column(
        Enum(CleaningPaymentStatus, name="cleaning_payment_status"),
        nullable=False,
        default=CleaningPaymentStatus.unpaid,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    access_token: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    disclaimer_accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    visits: Mapped[list["CleaningVisit"]] = relationship(back_populates="subscription")


class CleaningVisit(Base, TimestampMixin):
    """One of the 4 quarterly visits under a cleaning subscription."""

    __tablename__ = "cleaning_visits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("cleaning_subscriptions.id"), index=True, nullable=False
    )
    quarter: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..4
    scheduled_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CleaningVisitStatus] = mapped_column(
        Enum(CleaningVisitStatus, name="cleaning_visit_status"),
        nullable=False,
        default=CleaningVisitStatus.pending,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    subscription: Mapped["CleaningSubscription"] = relationship(back_populates="visits")

