"""Lineup schema changes for YouTube ingestion (PR 4)

- target_zone_id, stand_zone_id, utility_type_id: NOT NULL → nullable
  (auto-ingested lineups land before classification)
- side: NOT NULL → nullable (same reason)
- Add youtube_video_id VARCHAR(20), nullable, indexed
- Add chapter_start_seconds INTEGER, nullable
- Add chapter_title VARCHAR(500), nullable
- Add CHECK constraint: accepted lineups must have all classification fields set

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-12 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Make classification FKs nullable (pending_review rows have nulls) ---
    op.alter_column("lineup", "target_zone_id", nullable=True)
    op.alter_column("lineup", "stand_zone_id", nullable=True)
    op.alter_column("lineup", "utility_type_id", nullable=True)
    op.alter_column("lineup", "side", nullable=True)

    # --- New ingestion-tracking columns ---
    op.add_column(
        "lineup",
        sa.Column("youtube_video_id", sa.String(20), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("chapter_start_seconds", sa.Integer(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("chapter_title", sa.String(500), nullable=True),
    )

    # Index on youtube_video_id for dedup lookups
    op.create_index("ix_lineup_youtube_video_id", "lineup", ["youtube_video_id"])

    # CHECK constraint: accepted lineups must have all classification fields set.
    # Pending/hidden lineups may have nulls.
    op.create_check_constraint(
        "ck_lineup_accepted_classified",
        "lineup",
        (
            "status != 'accepted' OR ("
            "target_zone_id IS NOT NULL AND "
            "stand_zone_id IS NOT NULL AND "
            "utility_type_id IS NOT NULL AND "
            "side IS NOT NULL"
            ")"
        ),
    )


def downgrade() -> None:
    op.drop_constraint("ck_lineup_accepted_classified", "lineup", type_="check")
    op.drop_index("ix_lineup_youtube_video_id", table_name="lineup")
    op.drop_column("lineup", "chapter_title")
    op.drop_column("lineup", "chapter_start_seconds")
    op.drop_column("lineup", "youtube_video_id")

    # Restore NOT NULL — note: this will fail if any rows have NULLs in these cols.
    # Downgrade is only safe on a fresh DB with no pending_review rows.
    op.alter_column("lineup", "side", nullable=False)
    op.alter_column("lineup", "utility_type_id", nullable=False)
    op.alter_column("lineup", "stand_zone_id", nullable=False)
    op.alter_column("lineup", "target_zone_id", nullable=False)
