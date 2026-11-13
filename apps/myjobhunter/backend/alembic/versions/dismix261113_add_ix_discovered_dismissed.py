"""Add ``ix_discovered_dismissed`` for the Discover page's Dismissed view.

``GET /discover?state=dismissed`` lists a user's dismissed postings
newest-dismissed first, with ``id`` breaking ties so offset pages are stable:
``WHERE user_id = ? AND dismissed_at IS NOT NULL ... ORDER BY dismissed_at
DESC, id DESC``. No existing index covers it — ``ix_discovered_inbox`` and
``ix_discovered_saved`` are partial on ``dismissed_at IS NULL`` — so the
planner would scan every row of the user and sort. This partial index matches
the predicate and the order, so the page is an index scan with no sort node.

discovered_jobs is small at MJH v1 scale; a regular CREATE INDEX is fast
enough (same call as ``ixinbox260508``).

Revision ID: dismix261113
Revises: compdom261111
Create Date: 2026-11-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "dismix261113"
down_revision: Union[str, None] = "compdom261111"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_discovered_dismissed",
        "discovered_jobs",
        [sa.text("user_id"), sa.text("dismissed_at DESC"), sa.text("id DESC")],
        postgresql_where=sa.text("dismissed_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_discovered_dismissed", table_name="discovered_jobs")
