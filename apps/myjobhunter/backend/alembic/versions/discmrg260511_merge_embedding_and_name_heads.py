"""Merge ``discemb260511`` and ``discnam260511`` heads.

PR #568 (embeddings) and PR #574 (source name) were both authored against
``discsrc260511`` as their parent and merged in parallel, leaving the
migration graph with two heads. ``alembic upgrade head`` fails with
"Multiple head revisions are present" until the heads are merged.

This is a no-op merge migration — no schema changes, just unifies the
graph so future migrations have a single canonical parent.

Revision ID: discmrg260511
Revises: discemb260511, discnam260511
Create Date: 2026-05-11
"""
from typing import Sequence, Union


revision: str = "discmrg260511"
down_revision: Union[str, Sequence[str], None] = ("discemb260511", "discnam260511")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
