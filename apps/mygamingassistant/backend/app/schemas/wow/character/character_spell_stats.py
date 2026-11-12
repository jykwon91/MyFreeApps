"""The Spell tab: bonus damage and healing, chances in percent, and mana regen."""
from pydantic import BaseModel


class CharacterSpellStats(BaseModel):
    power: int
    healing: int
    crit: float
    hit: float
    haste: float
    penetration: int
    # Mana per 5 seconds out of casting and while casting.
    mana_regen: float
    mana_regen_casting: float
