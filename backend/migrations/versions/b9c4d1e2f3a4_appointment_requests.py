"""appointment requests for survey/installation

Revision ID: b9c4d1e2f3a4
Revises: a7b9c1d2e6f1
Create Date: 2026-03-11
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "b9c4d1e2f3a4"
down_revision = "a7b9c1d2e6f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # surveys: customer proposes a time; admin accepts/rejects
    op.add_column("surveys", sa.Column("requested_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("surveys", sa.Column("request_status", sa.String(length=20), nullable=True))
    op.add_column("surveys", sa.Column("request_note", sa.Text(), nullable=True))
    op.add_column("surveys", sa.Column("admin_note", sa.Text(), nullable=True))

    # installations: customer proposes a time; admin accepts/rejects
    op.add_column("installations", sa.Column("requested_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("installations", sa.Column("request_status", sa.String(length=20), nullable=True))
    op.add_column("installations", sa.Column("request_note", sa.Text(), nullable=True))
    op.add_column("installations", sa.Column("admin_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("installations", "admin_note")
    op.drop_column("installations", "request_note")
    op.drop_column("installations", "request_status")
    op.drop_column("installations", "requested_date")

    op.drop_column("surveys", "admin_note")
    op.drop_column("surveys", "request_note")
    op.drop_column("surveys", "request_status")
    op.drop_column("surveys", "requested_date")

