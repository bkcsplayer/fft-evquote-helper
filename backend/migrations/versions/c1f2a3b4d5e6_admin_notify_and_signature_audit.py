"""structured deposit-reported marker + signature audit (language/terms snapshot)

Revision ID: c1f2a3b4d5e6
Revises: b9c4d1e2f3a4
Create Date: 2026-06-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c1f2a3b4d5e6"
down_revision = "b9c4d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # surveys: structured "customer reported e-transfer" marker (replaces timeline string-matching)
    op.add_column(
        "surveys",
        sa.Column("deposit_reported", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "surveys",
        sa.Column("deposit_reported_at", sa.DateTime(timezone=True), nullable=True),
    )

    # quote_signatures: audit the language and exact terms text the customer signed under
    op.add_column("quote_signatures", sa.Column("signed_language", sa.String(length=8), nullable=True))
    op.add_column("quote_signatures", sa.Column("terms_snapshot", sa.Text(), nullable=True))

    # Backfill: any case whose history already shows a reported e-transfer gets the marker set,
    # recovering a best-effort timestamp from the earliest matching history row.
    op.execute(
        """
        UPDATE surveys s
        SET deposit_reported = true,
            deposit_reported_at = h.first_reported
        FROM (
            SELECT case_id, MIN(created_at) AS first_reported
            FROM case_status_history
            WHERE note = 'Customer reported e-transfer sent'
            GROUP BY case_id
        ) h
        WHERE h.case_id = s.case_id
        """
    )


def downgrade() -> None:
    op.drop_column("quote_signatures", "terms_snapshot")
    op.drop_column("quote_signatures", "signed_language")
    op.drop_column("surveys", "deposit_reported_at")
    op.drop_column("surveys", "deposit_reported")
