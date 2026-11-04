"""Add sensitive_revealed to applicant_events CHECK constraint.

Written each time someone asks for an applicant's private details.

Revision ID: sensrev261104
Revises: refreshsess261103
Create Date: 2026-11-04 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "sensrev261104"
down_revision: Union[str, None] = "refreshsess261103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PREVIOUS_TYPES = (
    "'lead', 'screening_pending', 'screening_passed', "
    "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
    "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
    "'screening_completed', 'reference_contacted', 'stage_changed', "
    "'contract_dates_changed', 'tenancy_ended', 'tenancy_restarted', "
    "'tenancy_extended', 'extension_undone'"
)


def upgrade() -> None:
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        f"event_type IN ({_PREVIOUS_TYPES}, 'sensitive_revealed')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM applicant_events WHERE event_type = 'sensitive_revealed'")
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        f"event_type IN ({_PREVIOUS_TYPES})",
    )
