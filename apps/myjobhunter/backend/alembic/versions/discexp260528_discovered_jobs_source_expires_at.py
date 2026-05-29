"""Add source_expires_at column to discovered_jobs.

The discovery inbox should surface ACTIVE postings only. Two expiry
signals drive that:

1. ``expired_at`` (already on the table) — set by the fetch service when
   a previously-seen posting disappears from a successful, non-empty
   fetch (we observed it vanish upstream).
2. ``source_expires_at`` (this migration) — a feed-declared close date
   the source hands us directly. JSearch returns
   ``job_offer_expiration_datetime_utc``; we normalize it onto this
   column. Greenhouse / Lever feeds carry no such field, so it stays
   NULL for those sources.

The inbox / saved queries exclude a row when ``expired_at`` is set OR
``source_expires_at`` is in the past. Keeping the two columns distinct
preserves the provenance of WHY a listing is inactive (operator-visible
later if we surface it) and lets a re-appearing posting clear
``expired_at`` on upsert without touching the feed-declared date.

Nullable, no backfill: existing rows have no captured expiry signal
(``source_expires_at`` was never populated before this PR); they remain
NULL and continue to be governed solely by ``expired_at``.

Revision ID: discexp260528
Revises: evtupd260521
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "discexp260528"
down_revision: Union[str, None] = "evtupd260521"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "discovered_jobs",
        sa.Column(
            "source_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("discovered_jobs", "source_expires_at")
