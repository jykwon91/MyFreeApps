"""A WoW Forever character as Blizzard saw it at their last log out."""
from datetime import datetime

from pydantic import BaseModel

from app.schemas.wow.character.character_item import CharacterItem


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
