"""Add updated_at column to application_events.

PR #721 introduced the ``interview_details`` JSONB column on
``application_events`` — the first user-editable field on what was
otherwise an immutable audit table.  PR #722 shipped the create-time
UI; the follow-up (this PR) introduces a PATCH endpoint so the
operator can backfill interview details that weren't known at logging
time (scheduled_at, location, interviewer names, etc.).

Once a field is editable, the table needs an ``updated_at`` so the
audit trail captures when the edit happened.  Mirrors the rest of the
MJH schema (every table except ``research_sources`` carries
``updated_at``).

Backfill: ``updated_at = created_at`` for all existing rows so the
column is non-null going forward. New rows get ``updated_at = now()``
from the server-side default; rows mutated via the new PATCH endpoint
get ``updated_at = now()`` via SQLAlchemy ``onupdate``.

Revision ID: evtupd260521
Revises: intrvdt260521
Create Date: 2026-05-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "evtupd260521"
down_revision: Union[str, None] = "intrvdt260521"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "application_events",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )
    op.execute(
        "UPDATE application_events SET updated_at = created_at "
        "WHERE updated_at IS NULL",
    )
    op.alter_column(
        "application_events",
        "updated_at",
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("application_events", "updated_at")
