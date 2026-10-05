"""bird_survey_quote_gst

Additive: adds the bird-netting survey result block to service_bookings, the GST / deposit /
draft-or-sent snapshot columns to bird_netting_quotes, and the 'surveyed' booking status.
Historical quotes are backfilled honestly as 0-tax (subtotal = total, gst 0), sent at creation.

Downgrade drops the new columns but CANNOT remove the 'surveyed' enum value (Postgres cannot
drop enum values) — same caveat as b1c2d3e4f5a6.

Revision ID: c7d8e9f0a1b2
Revises: 655efc445c97
Create Date: 2026-10-05
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "c7d8e9f0a1b2"
down_revision = "655efc445c97"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():  # same precedent as b1c2d3e4f5a6; IF NOT EXISTS makes a re-run safe
        op.execute("ALTER TYPE service_booking_status ADD VALUE IF NOT EXISTS 'surveyed' AFTER 'survey_scheduled'")
    # service_bookings
    op.add_column("service_bookings", sa.Column("survey_perimeter_ft", sa.Integer(), nullable=True))
    op.add_column("service_bookings", sa.Column("survey_nest_count", sa.Integer(), nullable=True))
    op.add_column("service_bookings", sa.Column("survey_notes", sa.Text(), nullable=True))
    op.add_column("service_bookings", sa.Column("survey_photo_urls", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")))
    op.add_column("service_bookings", sa.Column("surveyed_at", sa.DateTime(timezone=True), nullable=True))
    # bird_netting_quotes
    op.add_column("bird_netting_quotes", sa.Column("subtotal", sa.Numeric(10, 2), nullable=False, server_default="0"))
    op.add_column("bird_netting_quotes", sa.Column("gst_rate", sa.Numeric(4, 2), nullable=False, server_default="0"))
    op.add_column("bird_netting_quotes", sa.Column("gst_amount", sa.Numeric(10, 2), nullable=False, server_default="0"))
    op.add_column("bird_netting_quotes", sa.Column("deposit_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bird_netting_quotes", sa.Column("roll_override_reason", sa.Text(), nullable=True))
    op.add_column("bird_netting_quotes", sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE bird_netting_quotes SET subtotal = total, sent_at = created_at, deposit_amount = round(total * 0.30, 2)")


def downgrade() -> None:
    for col in ("sent_at", "roll_override_reason", "deposit_amount", "gst_amount", "gst_rate", "subtotal"):
        op.drop_column("bird_netting_quotes", col)
    for col in ("surveyed_at", "survey_photo_urls", "survey_notes", "survey_nest_count", "survey_perimeter_ft"):
        op.drop_column("service_bookings", col)
    # The 'surveyed' value stays in service_booking_status (Postgres cannot drop enum values).
