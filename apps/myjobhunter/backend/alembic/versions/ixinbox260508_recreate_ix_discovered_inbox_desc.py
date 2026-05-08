"""Recreate ``ix_discovered_inbox`` with explicit DESC NULLS LAST column ordering.

The original index defined columns as ``(user_id, score, discovered_at)`` with
default ASC ordering.  The inbox query sorts by
``nulls_last(desc(score)), desc(discovered_at)``, so Postgres could satisfy the
``user_id`` equality predicate from the index but had to perform an in-memory
sort for the score/discovered_at ordering — defeating the partial-index
purpose.

Recreating the index with ``score DESC NULLS LAST, discovered_at DESC`` lets
the planner perform an index scan in the query's natural sort order, eliminating
the sort node entirely.

discovered_jobs is small at MJH v1 scale (<10K rows); regular CREATE INDEX is
fast enough.  If the table grows beyond ~100K rows, switch to CONCURRENTLY in a
follow-up migration.

Revision ID: ixinbox260508
Revises: extctx260507
Create Date: 2026-05-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "ixinbox260508"
down_revision: Union[str, None] = "extctx260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_WHERE = "dismissed_at IS NULL AND saved_at IS NULL AND promoted_application_id IS NULL"


def upgrade() -> None:
    op.drop_index("ix_discovered_inbox", table_name="discovered_jobs")
    op.create_index(
        "ix_discovered_inbox",
        "discovered_jobs",
        [sa.text("user_id"), sa.text("score DESC NULLS LAST"), sa.text("discovered_at DESC")],
        postgresql_where=sa.text(_WHERE),
    )


def downgrade() -> None:
    op.drop_index("ix_discovered_inbox", table_name="discovered_jobs")
    op.create_index(
        "ix_discovered_inbox",
        "discovered_jobs",
        [sa.text("user_id"), sa.text("score"), sa.text("discovered_at")],
        postgresql_where=sa.text(_WHERE),
    )
