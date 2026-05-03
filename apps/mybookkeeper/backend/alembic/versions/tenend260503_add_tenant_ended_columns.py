"""Add tenant_ended_at and tenant_ended_reason to applicants; extend event types.

Tenant lifecycle: a tenant (stage=lease_signed) can be manually ended by the
host without changing stage. Two new columns track the end state:

  tenant_ended_at   — timestamp when the host called PATCH /tenancy/end
  tenant_ended_reason — optional text from the host (max 500 chars)

The ``is_ended`` predicate is computed at read-time:
  tenant_ended_at IS NOT NULL OR (contract_end IS NOT NULL AND contract_end < today)

Also extends the applicant_events CHECK constraint to include two new event
types: ``tenancy_ended`` and ``tenancy_restarted``.

Revision ID: tenend260503
Revises: cdate260502
Create Date: 2026-05-03 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "tenend260503"
down_revision: Union[str, None] = "cdate260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable columns to applicants.
    op.add_column(
        "applicants",
        sa.Column("tenant_ended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "applicants",
        sa.Column("tenant_ended_reason", sa.Text(), nullable=True),
    )

    # 2. Extend the event_type CHECK constraint to include new tenancy events.
    #    DROP old constraint, re-create with expanded value list.
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        "event_type IN ('lead', 'screening_pending', 'screening_passed', "
        "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
        "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
        "'screening_completed', 'reference_contacted', 'stage_changed', "
        "'contract_dates_changed', 'tenancy_ended', 'tenancy_restarted')",
    )


def downgrade() -> None:
    # Revert event type CHECK constraint (remove tenancy_ended, tenancy_restarted).
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        "event_type IN ('lead', 'screening_pending', 'screening_passed', "
        "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
        "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
        "'screening_completed', 'reference_contacted', 'stage_changed', "
        "'contract_dates_changed')",
    )

    op.drop_column("applicants", "tenant_ended_reason")
    op.drop_column("applicants", "tenant_ended_at")
