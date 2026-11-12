"""A character's dungeons, done or not, as Blizzard's statistics tell it."""
from pydantic import BaseModel

from app.schemas.wow.character.character_dungeon import CharacterDungeon


class CharacterDungeons(BaseModel):
    # "Total 5-player dungeons entered".
    runs: int
    dungeons: list[CharacterDungeon]
