"""The character pane's numbers, from Blizzard at the character's last log out.

Retail-only fields Blizzard also sends (mastery, versatility, lifesteal,
avoidance, speed, bonus armor, ratings) are left out — Classic has none.
"""
from pydantic import BaseModel

from app.schemas.wow.character.character_defense_stats import CharacterDefenseStats
from app.schemas.wow.character.character_melee_stats import CharacterMeleeStats
from app.schemas.wow.character.character_ranged_stats import CharacterRangedStats
from app.schemas.wow.character.character_resistances import CharacterResistances
from app.schemas.wow.character.character_spell_stats import CharacterSpellStats
from app.schemas.wow.character.character_stat_value import CharacterStatValue


class CharacterStats(BaseModel):
    health: int
    power: int
    # "Mana", "Rage", "Energy"…
    power_type: str
    strength: CharacterStatValue
    agility: CharacterStatValue
    stamina: CharacterStatValue
    intellect: CharacterStatValue
    spirit: CharacterStatValue
    melee: CharacterMeleeStats
    ranged: CharacterRangedStats
    spell: CharacterSpellStats
    defenses: CharacterDefenseStats
    resistances: CharacterResistances
    # Percent of normal run speed; 100 = normal.
    movement_speed: float
