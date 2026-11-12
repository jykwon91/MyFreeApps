"""One dungeon (or wing) and how many times the character has killed its final boss."""
from pydantic import BaseModel


class CharacterDungeon(BaseModel):
    name: str
    # "Cathedral", "Lower"…; None for a dungeon with one way through.
    wing: str | None
    # A Classic dungeon (it has a guide page); False for Forever's own.
    classic: bool
    # The final boss; None when it isn't known.
    boss: str | None
    # Final-boss kills; None when Blizzard doesn't track this dungeon.
    kills: int | None
    # Forever's level range; the same number twice for a Classic dungeon's one level.
    level_min: int
    level_max: int
    # The level to enter; None for Forever's own dungeons.
    required_level: int | None
