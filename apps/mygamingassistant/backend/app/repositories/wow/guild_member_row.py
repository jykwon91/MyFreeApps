"""One stored guild member as ``guild_repo.members`` reads it."""
from __future__ import annotations

from datetime import date, datetime
from typing import NamedTuple


class GuildMemberRow(NamedTuple):
    slug: str
    name: str
    surname: str
    class_id: int
    rank: int | None
    fetched_at: datetime
    # From the member's newest daily row; None when it has none (or Blizzard sent none).
    level: int | None
    item_level: int | None
    honorable_kills: int | None
    killing_blows: int | None
    deaths_from_players: int | None
    total_kills: int | None
    total_deaths: int | None
    dungeons_done: int | None
    exalted_reputations: int | None
    # The gains baseline (``guild_repo.members``): None when the member has no
    # older stored day to count from.
    baseline_day: date | None
    baseline_level: int | None
    baseline_honorable_kills: int | None
    baseline_killing_blows: int | None
    baseline_total_kills: int | None
    baseline_dungeons_done: int | None
