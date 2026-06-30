"""backfill appointments from existing scheduled survey/installation dates

Makes existing cases (e.g. FFT-2026-0002) appear in the new booking system seamlessly.
Idempotent: skips a case+kind that already has an appointment.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-29
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        """
        INSERT INTO appointments (id, case_id, kind, start_at, duration_min, status, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), s.case_id, 'survey'::appointment_kind, s.scheduled_date, 60,
               (CASE WHEN s.completed_at IS NOT NULL THEN 'completed' ELSE 'booked' END)::appointment_status,
               'admin', now(), now()
        FROM surveys s
        WHERE s.scheduled_date IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM appointments a WHERE a.case_id = s.case_id AND a.kind = 'survey'::appointment_kind
          )
        """
    ))
    conn.execute(sa.text(
        """
        INSERT INTO appointments (id, case_id, kind, start_at, duration_min, status, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), i.case_id, 'install'::appointment_kind, i.scheduled_date, 60,
               (CASE WHEN i.completed_at IS NOT NULL THEN 'completed' ELSE 'booked' END)::appointment_status,
               'admin', now(), now()
        FROM installations i
        WHERE i.scheduled_date IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM appointments a WHERE a.case_id = i.case_id AND a.kind = 'install'::appointment_kind
          )
        """
    ))


def downgrade() -> None:
    # Only remove backfilled rows (created_by='admin' with no matching customer booking is hard to
    # distinguish); leave data in place on downgrade to avoid losing real bookings.
    pass
