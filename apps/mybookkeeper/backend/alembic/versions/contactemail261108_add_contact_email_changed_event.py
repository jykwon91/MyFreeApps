"""Add contact_email_changed to applicant_events CHECK constraint.

Written when the host adds, changes or removes an applicant's email.

Revision ID: contactemail261108
Revises: schedebf261108
Create Date: 2026-11-08 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "contactemail261108"
down_revision: str | None = "schedebf261108"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PREVIOUS_TYPES = (
    "'lead', 'screening_pending', 'screening_passed', "
    "'screening_failed', 'video_call_done', 'approved', 'lease_sent', "
    "'lease_signed', 'declined', 'note_added', 'screening_initiated', "
    "'screening_completed', 'reference_contacted', 'stage_changed', "
    "'contract_dates_changed', 'tenancy_ended', 'tenancy_restarted', "
    "'tenancy_extended', 'extension_undone', 'sensitive_revealed'"
)


def upgrade() -> None:
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        f"event_type IN ({_PREVIOUS_TYPES}, 'contact_email_changed')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM applicant_events WHERE event_type = 'contact_email_changed'")
    op.drop_constraint(
        "chk_applicant_event_type", "applicant_events", type_="check",
    )
    op.create_check_constraint(
        "chk_applicant_event_type",
        "applicant_events",
        f"event_type IN ({_PREVIOUS_TYPES})",
    )
