"""The Ranged tab: ranged attack power, the ranged weapon's damage, and chances in percent."""
from pydantic import BaseModel

from app.schemas.wow.character.character_weapon_damage import CharacterWeaponDamage


class CharacterRangedStats(BaseModel):
    attack_power: int
    # Only when a weapon is in the ranged slot.
    damage: CharacterWeaponDamage | None
    crit: float
    hit: float
    haste: float
