"""A character's PvP record, as the armory shows it."""
from pydantic import BaseModel


class CharacterPvp(BaseModel):
    # Blizzard's ``pvp_rank``: 0 = no rank yet. Forever's rank titles are not mapped
    # until a ranked character shows what scale Blizzard uses.
    rank: int
    honorable_kills: int
    # From the statistics pane; None when Blizzard failed to send it.
    deaths_from_players: int | None
    deaths_from_opposite_faction: int | None
    # Where most honorable kills were made, and how many; None before the first.
    top_honor_continent: str | None
    top_honor_continent_kills: int | None
