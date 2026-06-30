"""slot-based booking: appointments, availability overrides, waitlist

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-06-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types once (idempotent); columns reference them with create_type=False so
    # create_table does not try to create them a second time.
    postgresql.ENUM("survey", "install", name="appointment_kind").create(op.get_bind(), checkfirst=True)
    postgresql.ENUM("booked", "cancelled", "completed", name="appointment_status").create(
        op.get_bind(), checkfirst=True
    )

    op.create_table(
        "appointments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id"), nullable=False),
        sa.Column("kind", postgresql.ENUM(name="appointment_kind", create_type=False), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_min", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("status", postgresql.ENUM(name="appointment_status", create_type=False), nullable=False, server_default="booked"),
        sa.Column("created_by", sa.String(length=20), nullable=False, server_default="customer"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_appointments_case_id", "appointments", ["case_id"])
    # Speeds up the capacity check (count active bookings for a given kind+slot).
    op.create_index("ix_appt_slot", "appointments", ["kind", "start_at", "status"])

    op.create_table(
        "availability_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("hour", sa.Integer(), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_availability_overrides_day", "availability_overrides", ["day"])

    op.create_table(
        "waitlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("postal", sa.String(length=20), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("waitlist")
    op.drop_index("ix_availability_overrides_day", table_name="availability_overrides")
    op.drop_table("availability_overrides")
    op.drop_index("ix_appt_slot", table_name="appointments")
    op.drop_index("ix_appointments_case_id", table_name="appointments")
    op.drop_table("appointments")
    postgresql.ENUM(name="appointment_status").drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name="appointment_kind").drop(op.get_bind(), checkfirst=True)
