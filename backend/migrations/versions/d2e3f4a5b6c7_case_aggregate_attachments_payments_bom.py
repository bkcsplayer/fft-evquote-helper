"""case aggregate root: attachments, payment ledger, BOM/materials, lost status

Revision ID: d2e3f4a5b6c7
Revises: c1f2a3b4d5e6
Create Date: 2026-06-25
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d2e3f4a5b6c7"
down_revision = "c1f2a3b4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) New CaseStatus value (funnel win/loss). PG16 allows ADD VALUE in a transaction.
    op.execute("ALTER TYPE case_status ADD VALUE IF NOT EXISTS 'lost'")

    ts = lambda: sa.text("now()")  # noqa: E731

    # 2) Unified attachment store
    op.create_table(
        "case_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id"), index=True, nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "survey_photo", "permit_doc", "installation_photo", "signed_quote", "contract", "invoice", "other",
                name="attachment_category",
            ),
            nullable=False,
        ),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("source_table", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
    )

    # 3) Payment ledger
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id"), index=True, nullable=False),
        sa.Column("kind", sa.Enum("deposit", "balance", "refund", name="payment_kind"), nullable=False),
        sa.Column("method", sa.Enum("etransfer", "stripe", "cash", "other", name="payment_method"), nullable=False, server_default="etransfer"),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.Enum("pending", "received", "refunded", name="payment_status"), nullable=False, server_default="pending"),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
    )

    # 4) Material master + per-case BOM
    op.create_table(
        "material_catalog",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("sku", sa.String(length=100), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.Enum("charger", "cable", "breaker", "conduit", "labor", "misc", name="material_category"), nullable=False, server_default="misc"),
        sa.Column("unit", sa.String(length=50), nullable=False, server_default="each"),
        sa.Column("default_unit_cost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("default_sell_price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
    )

    op.create_table(
        "case_bom_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("case_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("cases.id"), index=True, nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("material_catalog.id"), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("qty", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_cost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=ts(), nullable=False),
    )

    # 5) Seed the payment ledger from existing survey deposits.
    #    (Survey/permit/installation files are NOT copied here — the attachment center aggregates
    #     them live from their existing tables, so copying would duplicate them. case_attachments
    #     stores only new types: signed_quote / contract / invoice / other manual uploads.)
    op.execute(
        """
        INSERT INTO payments (id, case_id, kind, method, amount, status, received_at, note, created_at, updated_at)
        SELECT gen_random_uuid(), s.case_id, 'deposit'::payment_kind, 'etransfer'::payment_method, s.deposit_amount,
               'received'::payment_status, COALESCE(s.deposit_reported_at, s.updated_at),
               'Backfilled from survey deposit (paid)', now(), now()
        FROM surveys s WHERE s.deposit_paid = true
        """
    )
    op.execute(
        """
        INSERT INTO payments (id, case_id, kind, method, amount, status, note, created_at, updated_at)
        SELECT gen_random_uuid(), s.case_id, 'deposit'::payment_kind, 'etransfer'::payment_method, s.deposit_amount,
               'pending'::payment_status, 'Backfilled: customer reported e-transfer (unconfirmed)', now(), now()
        FROM surveys s WHERE s.deposit_reported = true AND s.deposit_paid = false
        """
    )


def downgrade() -> None:
    op.drop_table("case_bom_lines")
    op.drop_table("material_catalog")
    op.drop_table("payments")
    op.drop_table("case_attachments")
    for enum_name in ("material_category", "payment_status", "payment_method", "payment_kind", "attachment_category"):
        op.execute(f"DROP TYPE IF EXISTS {enum_name}")
    # Note: PostgreSQL cannot drop a single enum value, so 'lost' remains on case_status (harmless).
