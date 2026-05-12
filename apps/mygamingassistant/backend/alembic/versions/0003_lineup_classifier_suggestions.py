"""Lineup classifier suggestion columns (PR 5)

Adds nullable columns to the lineup table to store Claude's suggested
classification values. Distinct from the accepted FK columns so users
can compare what was suggested vs what they chose in the review queue.

New columns:
  - suggested_game_id        UUID FK → game.id (SET NULL)
  - suggested_map_id         UUID FK → map.id (SET NULL)
  - suggested_target_zone_id UUID FK → map_zone.id (SET NULL)
  - suggested_stand_zone_id  UUID FK → map_zone.id (SET NULL)
  - suggested_side           VARCHAR(10), nullable
  - suggested_utility_type_id UUID FK → utility_type.id (SET NULL)
  - classification_confidence FLOAT, nullable (0.0-1.0)
  - classification_reasoning  TEXT, nullable

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-12 00:00:00.000001
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lineup",
        sa.Column(
            "suggested_game_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("game.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "suggested_map_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "suggested_target_zone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_zone.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "suggested_stand_zone_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("map_zone.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "lineup",
        sa.Column("suggested_side", sa.String(10), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column(
            "suggested_utility_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("utility_type.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "lineup",
        sa.Column("classification_confidence", sa.Float(), nullable=True),
    )
    op.add_column(
        "lineup",
        sa.Column("classification_reasoning", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("lineup", "classification_reasoning")
    op.drop_column("lineup", "classification_confidence")
    op.drop_column("lineup", "suggested_utility_type_id")
    op.drop_column("lineup", "suggested_side")
    op.drop_column("lineup", "suggested_stand_zone_id")
    op.drop_column("lineup", "suggested_target_zone_id")
    op.drop_column("lineup", "suggested_map_id")
    op.drop_column("lineup", "suggested_game_id")
