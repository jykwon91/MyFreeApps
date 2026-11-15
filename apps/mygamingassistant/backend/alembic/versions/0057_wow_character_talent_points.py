"""Add talent_points to wow_character

Revision ID: 0057
Revises: 0056
Create Date: 2026-11-15 00:00:00.000000

WHY. The guild page's Roster tab now shows each member's talent-tree
distribution (the specialization trees they have points in).  This is
kept directly on the character row — guild queries read it in one pass
rather than joining through the sheet JSON.

``talent_points`` is a nullable JSON array of ``{tree_id, points}``
objects, one entry per talent tree the character has spent points in
(Blizzard omits trees with zero points from its /specializations answer):

* null — Blizzard's /specializations call failed on the last fetch, or
  the character has never been fetched since this column was added; the
  previous value is kept on a failed call, like professions.
* ``[]`` — the character has no points in any tree yet.
* ``[{"tree_id": 355, "points": 23}, …]`` — the trees with points.

Additive only: existing rows start null and fill on the next fetch.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0057"
down_revision: Union[str, None] = "0056"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("wow_character", sa.Column("talent_points", postgresql.JSONB(), nullable=True))
    op.create_check_constraint(
        "ck_wowcharacter_talent_points",
        "wow_character",
        "talent_points IS NULL OR jsonb_typeof(talent_points) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_wowcharacter_talent_points", "wow_character", type_="check")
    op.drop_column("wow_character", "talent_points")
