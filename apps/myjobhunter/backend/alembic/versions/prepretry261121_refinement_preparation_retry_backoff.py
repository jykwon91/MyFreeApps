"""Bound refinement-session preparation retries with a backoff.

A temporary Claude failure during preparation used to release the worker
claim, and the next poll picked the same session up at once, forever. The
worker now counts retries and waits longer between them (mirrors
``resume_upload_jobs.retry_count`` / ``next_retry_at``), marking the
session ``failed`` once the limit is reached.

Schema changes on ``resume_refinement_sessions``:

1. ``preparation_retry_count`` — temporary failures so far (0 for every
   existing row).
2. ``preparation_next_retry_at`` — when the session may be claimed again
   (NULL: claimable now).

Revision ID: prepretry261121
Revises: savedbeforedis261121
Create Date: 2026-11-21
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "prepretry261121"
down_revision: Union[str, None] = "savedbeforedis261121"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "preparation_retry_count", sa.Integer(), nullable=False, server_default="0",
        ),
    )
    op.add_column(
        "resume_refinement_sessions",
        sa.Column(
            "preparation_next_retry_at", sa.DateTime(timezone=True), nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("resume_refinement_sessions", "preparation_next_retry_at")
    op.drop_column("resume_refinement_sessions", "preparation_retry_count")
