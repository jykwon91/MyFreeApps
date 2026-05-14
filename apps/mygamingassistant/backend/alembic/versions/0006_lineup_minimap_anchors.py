"""Add minimap anchor coordinates to lineup

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-14 22:00:00.000000

Adds four nullable Float columns to lineup:

  stand_anchor_x, stand_anchor_y   — normalized 0-1 minimap position where
                                     the player stands to execute the throw
  target_anchor_x, target_anchor_y — normalized 0-1 minimap position where
                                     the utility lands

When NULL (the default for ingestion and back-compat), the API falls back
to the polygon centroid of stand_zone / target_zone for rendering. This
gives existing lineups an immediately-usable pin location and lets the
operator refine coordinates later via the review UI (PR 2 in this series).
"""
import sqlalchemy as sa
from alembic import op


revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lineup", sa.Column("stand_anchor_x", sa.Float(), nullable=True))
    op.add_column("lineup", sa.Column("stand_anchor_y", sa.Float(), nullable=True))
    op.add_column("lineup", sa.Column("target_anchor_x", sa.Float(), nullable=True))
    op.add_column("lineup", sa.Column("target_anchor_y", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("lineup", "target_anchor_y")
    op.drop_column("lineup", "target_anchor_x")
    op.drop_column("lineup", "stand_anchor_y")
    op.drop_column("lineup", "stand_anchor_x")
