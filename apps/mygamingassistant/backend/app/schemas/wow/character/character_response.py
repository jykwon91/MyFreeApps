"""A WoW Forever character as Blizzard saw it at their last log out."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.character.character_item import CharacterItem
from app.schemas.wow.character.character_professions import CharacterProfessions
from app.schemas.wow.character.character_stats import CharacterStats
from app.schemas.wow.character.character_talents import CharacterTalents


class CharacterResponse(BaseModel):
    slug: str
    name: str
    surname: str
    level: int
    race: str
    class_id: int
    class_name: str
    gender: str
    # alliance / horde
    faction: str
    guild: str | None
    # "PvP", "Normal"…
    ruleset: str | None
    equipped_item_level: int | None
    last_login: datetime | None
    has_render: bool
    items: list[CharacterItem]
    # None when Blizzard has no statistics for the character yet.
    stats: CharacterStats | None
    # None when Blizzard failed to send the talents (the rest of the sheet still shows).
    talents: CharacterTalents | None
    # None when Blizzard failed to send the professions (the rest of the sheet still shows).
    professions: CharacterProfessions | None
