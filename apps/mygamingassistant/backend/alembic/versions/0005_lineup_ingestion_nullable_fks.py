"""Make lineup.game_id and lineup.map_id nullable for pending_review rows

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14 15:10:00.000000

The original 0002_lineup_youtube_ingestion migration made
target_zone_id, stand_zone_id, utility_type_id, and side nullable so
chapters extracted from YouTube videos could land as pending_review
rows before the classifier filled in the values. game_id and map_id
were left NOT NULL — but lineup_service.create_from_ingestion and
LineupIngestCreate both assume game_id and map_id may be None during
that pending window. The mismatch silently broke ingestion in
production (NotNullViolationError on every chapter insert) until the
backend pytest CI workflow surfaced it.

The CHECK constraint ck_lineup_accepted_classified is rebuilt to
require game_id + map_id non-null only when status='accepted', mirroring
the existing rule for target_zone_id / stand_zone_id / utility_type_id /
side. Pending/hidden rows may have any of these unset.
"""
from alembic import op


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("lineup", "game_id", nullable=True)
    op.alter_column("lineup", "map_id", nullable=True)

    # Rebuild the CHECK constraint so the accepted-state guarantees
    # extend to game_id + map_id. PostgreSQL doesn't support ALTER on
    # CHECK constraint bodies — drop + recreate.
    op.drop_constraint("ck_lineup_accepted_classified", "lineup", type_="check")
    op.create_check_constraint(
        "ck_lineup_accepted_classified",
        "lineup",
        (
            "status != 'accepted' OR ("
            "game_id IS NOT NULL AND "
            "map_id IS NOT NULL AND "
            "target_zone_id IS NOT NULL AND "
            "stand_zone_id IS NOT NULL AND "
            "utility_type_id IS NOT NULL AND "
            "side IS NOT NULL"
            ")"
        ),
    )


def downgrade() -> None:
    # Restore the narrower CHECK constraint first.
    op.drop_constraint("ck_lineup_accepted_classified", "lineup", type_="check")
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
    # Downgrade is unsafe if any rows have null game_id or map_id —
    # the alter_column will raise. The operator should clear those
    # rows first (rare; only matters during emergency rollback).
    op.alter_column("lineup", "game_id", nullable=False)
    op.alter_column("lineup", "map_id", nullable=False)
