"""Add follow_up_sent event_type + active job_analyses lookup index.

Two changes ship together because the kanban dashboard needs both:

1. ``application_events.event_type`` gains ``follow_up_sent`` — a manual
   event the operator (or future Gmail sync) can log to record that they
   chased a recruiter / hiring manager. The kanban "days in stage" badge
   excludes this event from stage-defining transitions, but the activity
   feed renders it the same as any other event row.

   PostgreSQL cannot ALTER a CHECK constraint in place, so the migration
   drops ``chk_appevent_event_type`` and recreates it with the extended
   allowlist.

2. New partial index ``ix_job_analyses_applied_application_id_active`` on
   ``job_analyses(applied_application_id) WHERE deleted_at IS NULL``.
   The kanban LEFT JOIN from ``applications`` to ``job_analyses`` resolves
   the operator's verdict (strong_fit / worth_considering / stretch /
   mismatch) for each application that originated from an analysis.
   Without an index on ``applied_application_id`` this becomes a
   sequential scan of the analyses table for every kanban load.

   Partial WHERE filters out soft-deleted analyses so the index stays
   tight as the table grows.

Reversible: downgrade restores the prior CHECK and drops the index.

Revision ID: kanban260507
Revises: jobanal260506
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op


revision: str = "kanban260507"
down_revision: Union[str, None] = "jobanal260506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_EVENT_TYPES = (
    "applied",
    "email_received",
    "interview_scheduled",
    "interview_completed",
    "rejected",
    "offer_received",
    "withdrawn",
    "ghosted",
    "note_added",
)
_NEW_EVENT_TYPES = _OLD_EVENT_TYPES + ("follow_up_sent",)


def _quote_list(values: tuple[str, ...]) -> str:
    return ",".join(f"'{v}'" for v in values)


def upgrade() -> None:
    # 1. Recreate the CHECK constraint with follow_up_sent in the allowlist.
    op.drop_constraint(
        "chk_appevent_event_type",
        "application_events",
        type_="check",
    )
    op.create_check_constraint(
        "chk_appevent_event_type",
        "application_events",
        f"event_type IN ({_quote_list(_NEW_EVENT_TYPES)})",
    )

    # 2. Add a partial index on job_analyses.applied_application_id so the
    #    kanban LEFT JOIN doesn't sequentially scan the analyses table.
    op.create_index(
        "ix_job_analyses_applied_application_id_active",
        "job_analyses",
        ["applied_application_id"],
        postgresql_where="deleted_at IS NULL",
    )


def downgrade() -> None:
    # Drop the partial index first so the old schema shape is restored
    # exactly.
    op.drop_index(
        "ix_job_analyses_applied_application_id_active",
        table_name="job_analyses",
    )

    # Restore the original CHECK constraint without follow_up_sent.
    op.drop_constraint(
        "chk_appevent_event_type",
        "application_events",
        type_="check",
    )
    op.create_check_constraint(
        "chk_appevent_event_type",
        "application_events",
        f"event_type IN ({_quote_list(_OLD_EVENT_TYPES)})",
    )
