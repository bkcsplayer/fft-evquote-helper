"""installation report fields and photos

Revision ID: a7b9c1d2e6f1
Revises: 37db32f8334a
Create Date: 2026-03-10
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a7b9c1d2e6f1"
down_revision = "37db32f8334a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("installations", sa.Column("installed_items", sa.Text(), nullable=True))
    op.add_column("installations", sa.Column("wire_gauge", sa.String(length=50), nullable=True))
    op.add_column("installations", sa.Column("max_charging_amps", sa.Integer(), nullable=True))
    op.add_column("installations", sa.Column("test_passed", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("installations", sa.Column("test_notes", sa.Text(), nullable=True))

    op.create_table(
        "installation_photos",
        sa.Column("id", sa.UUID(), primary_key=True, nullable=False),
        sa.Column("installation_id", sa.UUID(), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["installation_id"], ["installations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_installation_photos_installation_id", "installation_photos", ["installation_id"])


def downgrade() -> None:
    op.drop_index("ix_installation_photos_installation_id", table_name="installation_photos")
    op.drop_table("installation_photos")

    op.drop_column("installations", "test_notes")
    op.drop_column("installations", "test_passed")
    op.drop_column("installations", "max_charging_amps")
    op.drop_column("installations", "wire_gauge")
    op.drop_column("installations", "installed_items")

