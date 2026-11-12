"""The Melee tab: attack power, each hand's damage, and chances in percent."""
from pydantic import BaseModel

from app.schemas.wow.character.character_weapon_damage import CharacterWeaponDamage


class CharacterMeleeStats(BaseModel):
    attack_power: int
    main_hand: CharacterWeaponDamage | None
    # Only when a one-hand weapon is in the off hand.
    off_hand: CharacterWeaponDamage | None
    crit: float
    hit: float
    haste: float
    expertise: float
