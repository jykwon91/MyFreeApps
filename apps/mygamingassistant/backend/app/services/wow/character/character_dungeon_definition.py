"""One dungeon (or wing) the character page marks done / not done."""
from dataclasses import dataclass


@dataclass(frozen=True)
class CharacterDungeonDefinition:
    name: str
    wing: str | None
    # A Classic dungeon (it has a guide page); False for Forever's own.
    classic: bool
    boss: str | None
    # Boss Kills statistics for the final boss; empty when Blizzard keeps none.
    statistic_ids: tuple[int, ...]
    level_min: int
    level_max: int
    # None for Forever's own dungeons, which have no level to enter.
    required_level: int | None
