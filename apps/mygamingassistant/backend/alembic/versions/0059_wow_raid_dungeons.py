"""Raid bot: dungeons can be scheduled too

Revision ID: 0059
Revises: 0058
Create Date: 2026-11-17 00:00:00.000000

WHY. Guilds want the raid sign-up bot for dungeon runs (5-player groups and
Upper Blackrock Spire's 10).  ``wow_raid_event.raid_key`` is checked against
a fixed list, so the dungeons' keys join it.  Additive: every existing row
keeps a valid key; the downgrade fails if a dungeon event exists, which is
the point (it would no longer be valid).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0059"
down_revision: Union[str, None] = "0058"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_RAIDS = ("barrow_deeps", "hyjal_summit", "mc", "onyxia", "bwl", "zg", "aq20", "aq40", "naxx")
_DUNGEONS = (
    "hall_of_thanes",
    "ruins_of_lordaeron",
    "excavation_wetlands",
    "city_of_dalaran",
    "drowned_city",
    "krol_dok",
    "alcaz_prison",
    "blackmaw_hold",
    "shapers_terrace",
    "ragefire",
    "deadmines",
    "wailing_caverns",
    "shadowfang",
    "blackfathom",
    "stockade",
    "razorfen_kraul",
    "gnomeregan",
    "scarlet_monastery",
    "razorfen_downs",
    "uldaman",
    "maraudon",
    "zul_farrak",
    "sunken_temple",
    "brd",
    "lbrs",
    "ubrs",
    "dire_maul",
    "stratholme",
    "scholomance",
)
_CONSTRAINT = "ck_wowraidevent_raid_key"


def _recreate(keys: tuple[str, ...]) -> None:
    op.drop_constraint(_CONSTRAINT, "wow_raid_event", type_="check")
    op.create_check_constraint(_CONSTRAINT, "wow_raid_event", f"raid_key IN {keys!r}")


def upgrade() -> None:
    _recreate(_RAIDS + _DUNGEONS)


def downgrade() -> None:
    _recreate(_RAIDS)
