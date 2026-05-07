"""Backfill: deduplicate accumulated research_sources rows.

Bug: ``company_research_repository.upsert_for_company`` was UPDATING
the existing CompanyResearch row on rerun while
``create_sources`` always APPENDED a fresh batch of ResearchSource
rows. The "previous sources cascade-deleted on upsert" comment was
wrong — ON DELETE CASCADE only fires when the parent row is deleted,
not when it's updated. Result: every rerun multiplied the source
count (38 rows for a company that had research run 4 times).

The repository fix lands in the same PR
(``fix/myjobhunter-research-get-and-source-dedup``) — this migration
deletes the duplicate rows that already accumulated in production.

Strategy: keep one row per (company_research_id, url) — the row with
the most recent ``fetched_at``. Delete the rest. Source records are
immutable + entirely server-derived, so dropping older copies is
safe; the surviving row has the freshest snippet and is what the
GET response would return anyway.

Reversible: downgrade is a no-op (the deleted rows had no useful
distinct content beyond their older fetched_at timestamps).

Revision ID: srcdedup260507
Revises: kanban260507
Create Date: 2026-05-07
"""
from typing import Sequence, Union

from alembic import op


revision: str = "srcdedup260507"
down_revision: Union[str, None] = "kanban260507"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Delete every row whose (company_research_id, url) tuple has a
    # newer sibling. ``ROW_NUMBER() OVER (PARTITION BY ... ORDER BY
    # fetched_at DESC, created_at DESC)`` ranks the dups; keep rank 1.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY company_research_id, url
                    ORDER BY fetched_at DESC, created_at DESC
                ) AS rn
            FROM research_sources
        )
        DELETE FROM research_sources
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
        """
    )


def downgrade() -> None:
    # Irreversible — the older duplicate rows are gone and re-creating
    # them would be both impossible (snippets are not preserved
    # elsewhere) and pointless (they were redundant by definition).
    pass
