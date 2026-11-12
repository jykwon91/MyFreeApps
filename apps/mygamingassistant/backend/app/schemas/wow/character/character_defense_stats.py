"""The Defenses tab: armor, defense skill, and avoidance chances in percent."""
from pydantic import BaseModel

from app.schemas.wow.character.character_stat_value import CharacterStatValue


class CharacterDefenseStats(BaseModel):
    armor: CharacterStatValue
    defense: CharacterStatValue
    dodge: float
    parry: float
    block: float
