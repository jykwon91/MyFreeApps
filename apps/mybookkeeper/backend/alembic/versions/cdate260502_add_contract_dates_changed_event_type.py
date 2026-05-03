"""add contract_dates_changed to applicant_events event_type check constraint

The contract date editing feature (PR mbk-applicant-contract-dates-editable)
writes a ``contract_dates_changed`` event when a host updates contract_start
or contract_end on an applicant that has not yet reached ``lease_signed``.

Revision ID: cdate260502
Revises: lease260502
Create Date: 2026-05-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "cdate260502"
down_revision: Union[str, None] = "lease260502"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Extend the event_type CheckConstraint to include "contract_dates_changed".
    # DROP the old constraint, re-create it with the expanded value list.
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
        "'screening_completed', 'reference_contacted', 'stage_changed')",
    )
