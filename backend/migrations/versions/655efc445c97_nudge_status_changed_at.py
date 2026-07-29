"""nudge_status_changed_at

Revision ID: 655efc445c97
Revises: b1c2d3e4f5a6
Create Date: 2026-07-29 15:43:32.009717
"""

from alembic import op
import sqlalchemy as sa



# revision identifiers, used by Alembic.
revision = '655efc445c97'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "service_bookings",
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
    )
    op.add_column(
        "cleaning_subscriptions",
        sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()),
    )
    op.execute("UPDATE service_bookings SET status_changed_at = COALESCE(updated_at, created_at, now())")
    op.execute("UPDATE cleaning_subscriptions SET status_changed_at = COALESCE(updated_at, created_at, now())")
    op.alter_column("service_bookings", "status_changed_at", nullable=False)
    op.alter_column("cleaning_subscriptions", "status_changed_at", nullable=False)


def downgrade() -> None:
    op.drop_column("service_bookings", "status_changed_at")
    op.drop_column("cleaning_subscriptions", "status_changed_at")

