"""Add tenancy_extended and extension_undone to applicant_events CHECK constraint.

The lease-extension flow (extend_lease / undo_extension in
``services/leases/lease_extension_service.py``) now writes a timeline event
on every extension and undo so the applicant history reflects the lifecycle.

Revision ID: extevt260520
Revises: rarqprop260517
Create Date: 2026-05-20 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "extevt260520"
down_revision: Union[str, None] = "rarqprop260517"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
        "'contract_dates_changed', 'tenancy_ended', 'tenancy_restarted', "
        "'tenancy_extended', 'extension_undone')",
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
        "'screening_completed', 'reference_contacted', 'stage_changed', "
        "'contract_dates_changed', 'tenancy_ended', 'tenancy_restarted')",
    )
