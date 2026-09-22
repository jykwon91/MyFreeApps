"""Canonical stat keys for WoW Forever items.

Every stat the item reader can return is one of these keys. The frontend mirrors
this union in ``frontend/src/games/wow-forever/data/statKeys.ts`` (``StatKey``);
``tests/test_wow_stat_keys_parity.py`` fails CI if the two drift, because a key
the frontend doesn't know would be silently dropped from scoring.

Units:
  - ``*_pct``      — a percentage as shown on a Classic Era tooltip
                     ("Improves your chance to hit by 1%" -> hit_pct=1).
  - ``*_rating``   — a combat RATING as shown on a rated tooltip ("+10 Hit
                     Rating"). Forever may show ratings; their per-level
                     conversion to percent isn't published, so ratings are
                     captured but not scored.
  - everything else is a flat amount.
"""
from typing import Literal, get_args

StatKey = Literal[
    # Primary
    "strength",
    "agility",
    "stamina",
    "intellect",
    "spirit",
    # Physical
    "attack_power",
    "ranged_attack_power",
    "feral_attack_power",
    "hit_pct",
    "crit_pct",
    "haste_pct",
    "expertise",
    # Spell
    "spell_power",
    "spell_damage",
    "healing",
    "arcane_spell_damage",
    "fire_spell_damage",
    "frost_spell_damage",
    "holy_spell_damage",
    "nature_spell_damage",
    "shadow_spell_damage",
    "spell_hit_pct",
    "spell_crit_pct",
    "spell_haste_pct",
    "spell_penetration",
    "mp5",
    # Defensive
    "defense",
    "dodge_pct",
    "parry_pct",
    "block_pct",
    "block_value",
    # Resistances
    "all_resistance",
    "arcane_resistance",
    "fire_resistance",
    "frost_resistance",
    "nature_resistance",
    "shadow_resistance",
    # Ratings (captured, not scored — see module docstring)
    "hit_rating",
    "crit_rating",
    "spell_hit_rating",
    "spell_crit_rating",
    "haste_rating",
    "expertise_rating",
    "defense_rating",
    "dodge_rating",
    "parry_rating",
    "block_rating",
    # Flat pools (captured, not scored)
    "health",
    "mana",
]

STAT_KEYS: tuple[str, ...] = get_args(StatKey)

# Loose bound on any single stat value. Real items are far below this; a
# larger number means the model misread the tooltip (e.g. item level or
# durability read as a stat).
MAX_ABS_STAT_VALUE = 10_000.0
