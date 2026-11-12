"""Blizzard recipe ids (SkillLineAbility rows) mapped to the recipe spells our crafting files use."""
from __future__ import annotations

from scripts.wow_professions.abilities import ability_spells


def test_only_profession_lines_with_a_spell_are_kept_in_id_order() -> None:
    rows = [
        {"ID": "2385", "SkillLine": "197", "Spell": "3848"},
        {"ID": "2359", "SkillLine": "197", "Spell": "2963"},
        {"ID": "7316", "SkillLine": "333", "Spell": "13262"},
        {"ID": "10", "SkillLine": "6", "Spell": "133"},  # a class skill line, not a profession
        {"ID": "11", "SkillLine": "197", "Spell": ""},
    ]
    assert ability_spells(rows, {197, 333}) == {"2359": 2963, "2385": 3848, "7316": 13262}
