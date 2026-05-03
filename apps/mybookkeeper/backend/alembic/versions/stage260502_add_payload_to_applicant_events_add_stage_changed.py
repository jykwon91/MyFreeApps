"""add payload JSONB to applicant_events; add stage_changed event type

The manual stage-transition feature (PR manual-stage) writes a
``stage_changed`` event with a JSONB payload ``{from, to, note}`` so the
host's approval history is auditable without querying the applicant row
history.

Revision ID: stage260502
Revises: mbk260502
Create Date: 2026-05-02 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "stage260502"
down_revision: Union[str, None] = "mbk260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add nullable JSONB payload column to applicant_events.
    op.add_column(
        "applicant_events",
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # 2. Extend the event_type CheckConstraint to include "stage_changed".
    #    DROP the old constraint, re-create it with the expanded value list.
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        "event_type IN ('lead', 'screening_pending', 'screening_passed', "
        "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
        "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
        "'screening_completed', 'reference_contacted', 'stage_changed')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        "event_type IN ('lead', 'screening_pending', 'screening_passed', "
        "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
        "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
        "'screening_completed', 'reference_contacted')",
    )
    op.drop_column("applicant_events", "payload")
