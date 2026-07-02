"""Async session preparation: preparing/failed statuses + claim marker.

POST /resume-refinement/sessions used to run the critique pass plus a
prefetch of EVERY target proposal synchronously — a 1-2 minute blocking
request behind a single button spinner, fragile against the 2-minute
Caddy timeouts. Sessions are now created in ``preparing`` and the
expensive work runs in the background worker (same process as the
resume parser); the session unlocks (``active``) when the first
proposal is ready.

Schema changes on ``resume_refinement_sessions``:

1. Status check constraint widened with ``preparing`` and ``failed``.
2. ``error_message`` — populated when preparation fails; drives the
   frontend "Try again" card (mirrors ``resume_upload_jobs``).
3. ``preparation_started_at`` — atomic worker-claim marker so
   concurrent worker replicas never prepare the same session twice.

No backfill: existing rows are all in the old statuses and keep
working; new columns are nullable.

Revision ID: prep260702
Revises: guardfacts260702
Create Date: 2026-07-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "prep260702"
down_revision: Union[str, None] = "guardfacts260702"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resume_refinement_sessions",
        sa.Column("error_message", sa.Text(), nullable=True),
    )
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "preparation_started_at", sa.DateTime(timezone=True), nullable=True,
        ),
    )
    op.drop_constraint(
        "chk_refinement_session_status",
        "resume_refinement_sessions",
        type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_session_status",
        "resume_refinement_sessions",
        "status IN ('preparing','active','completed','abandoned','failed')",
    )


def downgrade() -> None:
    # Any rows stuck in the new statuses would violate the old
    # constraint — resolve them to the nearest old-world equivalent
    # before narrowing.
    op.execute(
        "UPDATE resume_refinement_sessions "
        "SET status = 'abandoned' WHERE status IN ('preparing','failed')"
    )
    op.drop_constraint(
        "chk_refinement_session_status",
        "resume_refinement_sessions",
        type_="check",
    )
    op.create_check_constraint(
        "chk_refinement_session_status",
        "resume_refinement_sessions",
        "status IN ('active','completed','abandoned')",
    )
    op.drop_column("resume_refinement_sessions", "preparation_started_at")
    op.drop_column("resume_refinement_sessions", "error_message")
