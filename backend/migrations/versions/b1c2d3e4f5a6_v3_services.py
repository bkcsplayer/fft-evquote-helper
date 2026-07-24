"""v3.0 four-service portal: generalize Appointment (shared pool) + new-service tables

Revision ID: b1c2d3e4f5a6
Revises: a5b6c7d8e9f0
Create Date: 2026-07-23

Additive + backward compatible:
  * appointment_kind enum extended (diagnostic / bird_survey / bird_install / cleaning)
  * appointments generalized: case_id -> nullable, + service_booking_id / cleaning_visit_id,
    capacity index becomes (start_at, status) since the pool is now shared (kind-agnostic),
    single-target CHECK constraint
  * notifications: case_id -> nullable, + service_booking_id / cleaning_subscription_id
  * new tables: service_bookings, bird_netting_quotes, cleaning_subscriptions, cleaning_visits
No EV data is modified.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b1c2d3e4f5a6"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── extend appointment_kind (shared pool; new kinds label service appointments) ──
    # Enum ADD VALUE must be committed before it can be used; do it in an autocommit block so it
    # is independent of this migration's transaction.
    with op.get_context().autocommit_block():
        for val in ("diagnostic", "bird_survey", "bird_install", "cleaning"):
            op.execute(f"ALTER TYPE appointment_kind ADD VALUE IF NOT EXISTS '{val}'")

    # ── new enum types ──
    service_type = postgresql.ENUM("diagnostic", "bird_netting", name="service_type")
    service_booking_status = postgresql.ENUM(
        "submitted", "scheduled", "survey_scheduled", "quoted", "approved",
        "in_progress", "install_scheduled", "completed", "cancelled",
        name="service_booking_status",
    )
    quote_status = postgresql.ENUM("pending", "approved", "rejected", name="quote_status")
    cleaning_tier = postgresql.ENUM("tier1", "tier2", "custom", name="cleaning_tier")
    cleaning_pricing_status = postgresql.ENUM("quoted", "pending_quote", name="cleaning_pricing_status")
    cleaning_payment_status = postgresql.ENUM("unpaid", "paid", "refunded", name="cleaning_payment_status")
    cleaning_visit_status = postgresql.ENUM(
        "pending", "notified", "completed", "skipped", name="cleaning_visit_status"
    )
    for e in (
        service_type, service_booking_status, quote_status, cleaning_tier,
        cleaning_pricing_status, cleaning_payment_status, cleaning_visit_status,
    ):
        e.create(bind, checkfirst=True)

    # ── service_bookings (diagnostic + bird netting) ──
    op.create_table(
        "service_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reference_number", sa.String(length=20), nullable=False),
        sa.Column("service_type", postgresql.ENUM(name="service_type", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM(name="service_booking_status", create_type=False), nullable=False, server_default="submitted"),
        sa.Column("customer_name", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("panel_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preferred_window", sa.String(length=50), nullable=True),
        sa.Column("inverter_info", sa.Text(), nullable=True),
        sa.Column("problem_description", sa.Text(), nullable=True),
        sa.Column("problem_tags", postgresql.JSONB(), nullable=True),
        sa.Column("photo_urls", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("technician", sa.String(length=100), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_hours", sa.Numeric(5, 2), nullable=True),
        sa.Column("hardware_involved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completion_notes", sa.Text(), nullable=True),
        sa.Column("hourly_rate_snapshot", sa.Numeric(10, 2), nullable=True),
        sa.Column("access_token", sa.String(length=64), nullable=False),
        sa.Column("disclaimer_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_service_bookings_reference_number", "service_bookings", ["reference_number"], unique=True)
    op.create_index("ix_service_bookings_access_token", "service_bookings", ["access_token"], unique=True)

    # ── bird_netting_quotes ──
    op.create_table(
        "bird_netting_quotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("service_bookings.id"), nullable=False),
        sa.Column("roll_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("nest_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("roll_price_snapshot", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("nest_fee_snapshot", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("status", postgresql.ENUM(name="quote_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("signature_data", sa.Text(), nullable=True),
        sa.Column("signed_name", sa.String(length=120), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bird_netting_quotes_booking_id", "bird_netting_quotes", ["booking_id"], unique=True)

    # ── cleaning_subscriptions ──
    op.create_table(
        "cleaning_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("reference_number", sa.String(length=20), nullable=False),
        sa.Column("customer_name", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("panel_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tier", postgresql.ENUM(name="cleaning_tier", create_type=False), nullable=False),
        sa.Column("annual_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("pricing_status", postgresql.ENUM(name="cleaning_pricing_status", create_type=False), nullable=False, server_default="quoted"),
        sa.Column("payment_status", postgresql.ENUM(name="cleaning_payment_status", create_type=False), nullable=False, server_default="unpaid"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("access_token", sa.String(length=64), nullable=False),
        sa.Column("disclaimer_accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cleaning_subscriptions_reference_number", "cleaning_subscriptions", ["reference_number"], unique=True)
    op.create_index("ix_cleaning_subscriptions_access_token", "cleaning_subscriptions", ["access_token"], unique=True)

    # ── cleaning_visits ──
    op.create_table(
        "cleaning_visits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subscription_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cleaning_subscriptions.id"), nullable=False),
        sa.Column("quarter", sa.Integer(), nullable=False),
        sa.Column("scheduled_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", postgresql.ENUM(name="cleaning_visit_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cleaning_visits_subscription_id", "cleaning_visits", ["subscription_id"])

    # ── generalize appointments (shared capacity pool) ──
    op.alter_column("appointments", "case_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("appointments", sa.Column("service_booking_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("appointments", sa.Column("cleaning_visit_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_appointments_service_booking", "appointments", "service_bookings", ["service_booking_id"], ["id"])
    op.create_foreign_key("fk_appointments_cleaning_visit", "appointments", "cleaning_visits", ["cleaning_visit_id"], ["id"])
    op.create_index("ix_appointments_service_booking_id", "appointments", ["service_booking_id"])
    op.create_index("ix_appointments_cleaning_visit_id", "appointments", ["cleaning_visit_id"])
    # Capacity is now a shared pool (kind-agnostic): index on (start_at, status).
    op.drop_index("ix_appt_slot", table_name="appointments")
    op.create_index("ix_appt_slot", "appointments", ["start_at", "status"])
    op.create_check_constraint(
        "ck_appointments_single_target",
        "appointments",
        "(case_id IS NOT NULL)::int + (service_booking_id IS NOT NULL)::int"
        " + (cleaning_visit_id IS NOT NULL)::int = 1",
    )

    # ── generalize notifications (service/subscription-scoped rows) ──
    op.alter_column("notifications", "case_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("notifications", sa.Column("service_booking_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("notifications", sa.Column("cleaning_subscription_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_notifications_service_booking", "notifications", "service_bookings", ["service_booking_id"], ["id"])
    op.create_foreign_key("fk_notifications_cleaning_subscription", "notifications", "cleaning_subscriptions", ["cleaning_subscription_id"], ["id"])
    op.create_index("ix_notifications_service_booking_id", "notifications", ["service_booking_id"])
    op.create_index("ix_notifications_cleaning_subscription_id", "notifications", ["cleaning_subscription_id"])


def downgrade() -> None:
    # notifications
    op.drop_index("ix_notifications_cleaning_subscription_id", table_name="notifications")
    op.drop_index("ix_notifications_service_booking_id", table_name="notifications")
    op.drop_constraint("fk_notifications_cleaning_subscription", "notifications", type_="foreignkey")
    op.drop_constraint("fk_notifications_service_booking", "notifications", type_="foreignkey")
    op.drop_column("notifications", "cleaning_subscription_id")
    op.drop_column("notifications", "service_booking_id")
    op.alter_column("notifications", "case_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    # appointments
    op.drop_constraint("ck_appointments_single_target", "appointments", type_="check")
    op.drop_index("ix_appt_slot", table_name="appointments")
    op.create_index("ix_appt_slot", "appointments", ["kind", "start_at", "status"])
    op.drop_index("ix_appointments_cleaning_visit_id", table_name="appointments")
    op.drop_index("ix_appointments_service_booking_id", table_name="appointments")
    op.drop_constraint("fk_appointments_cleaning_visit", "appointments", type_="foreignkey")
    op.drop_constraint("fk_appointments_service_booking", "appointments", type_="foreignkey")
    op.drop_column("appointments", "cleaning_visit_id")
    op.drop_column("appointments", "service_booking_id")
    op.alter_column("appointments", "case_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    op.drop_table("cleaning_visits")
    op.drop_table("cleaning_subscriptions")
    op.drop_table("bird_netting_quotes")
    op.drop_table("service_bookings")

    for name in (
        "cleaning_visit_status", "cleaning_payment_status", "cleaning_pricing_status",
        "cleaning_tier", "quote_status", "service_booking_status", "service_type",
    ):
        postgresql.ENUM(name=name).drop(op.get_bind(), checkfirst=True)
    # appointment_kind enum values are left in place (Postgres cannot easily drop enum values).
