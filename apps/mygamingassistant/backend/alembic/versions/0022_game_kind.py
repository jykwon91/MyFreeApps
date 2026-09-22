"""Add game.kind ('lineups' | 'companion'); side labels nullable for companions

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-22 00:00:00.000000

WHY. MGA is a general gaming assistant, but every game so far has been a
tactical FPS with maps, zones, utilities and two sides. World of Warcraft:
Forever is the first game without any of that — its surface is static guides
and an item-compare tool. ``kind`` records which feature family a game uses so
the lineup machinery (classifier reference data, lineup game pickers) can skip
games it does not apply to, and the frontend registry can route a companion
game to its own landing page instead of the map grid.

A single enum column rather than a features list: a game is either a lineup
library or a companion today, the companion's feature pages are static
frontend content owned by ``src/games/registry.ts``, and a String +
CheckConstraint is enforceable in the database where a JSON list is not.
Widening later (e.g. a game with both) is an ALTER of the constraint.

SIDE LABELS. Companion games have no attacker/defender split, so
``side_a_label`` / ``side_b_label`` become nullable. ``ck_game_lineup_side_labels``
keeps them mandatory for every lineup game, so the invariant the lineup UI
relies on still holds in the database.

BACKFILL. ``server_default='lineups'`` backfills CS2 and Valorant, which is
correct: both are lineup games. The WoW Forever row itself is inserted by the
fixture loader (``python -m app.cli load-fixtures``), not here.

DOWNGRADE deletes companion games (they would violate NOT NULL side labels),
then restores NOT NULL and drops the column. Companion games own no maps,
lineups, agents or utility types, so the delete cascades to nothing.
"""
import sqlalchemy as sa
from alembic import op


revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game",
        sa.Column(
            "kind",
            sa.String(length=20),
            nullable=False,
            server_default="lineups",
        ),
    )
    op.create_check_constraint(
        "ck_game_kind",
        "game",
        "kind IN ('lineups', 'companion')",
    )
    op.alter_column("game", "side_a_label", existing_type=sa.String(length=50), nullable=True)
    op.alter_column("game", "side_b_label", existing_type=sa.String(length=50), nullable=True)
    op.create_check_constraint(
        "ck_game_lineup_side_labels",
        "game",
        "kind <> 'lineups' OR (side_a_label IS NOT NULL AND side_b_label IS NOT NULL)",
    )


def downgrade() -> None:
    op.execute("DELETE FROM game WHERE kind = 'companion'")
    op.drop_constraint("ck_game_lineup_side_labels", "game", type_="check")
    op.alter_column("game", "side_b_label", existing_type=sa.String(length=50), nullable=False)
    op.alter_column("game", "side_a_label", existing_type=sa.String(length=50), nullable=False)
    op.drop_constraint("ck_game_kind", "game", type_="check")
    op.drop_column("game", "kind")
