"""WoW Forever Warlock macro names — selection rules, and sanity checks on the committed JSON."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_warlock.build import OUT_PATH, check_skill_lines, potion_names, spell_names, stone_names

ABILITIES = [
    {"SkillLine": "355", "Spell": "1"},
    {"SkillLine": "354", "Spell": "2"},
    {"SkillLine": "355", "Spell": "1"},
    {"SkillLine": "355", "Spell": "3"},
    {"SkillLine": "205", "Spell": "4"},
    {"SkillLine": "999", "Spell": "5"},
    {"SkillLine": "355", "Spell": "6"},
]
SPELL_NAMES = {"1": "Corruption", "2": "Banish", "3": "?", "4": "Seduction", "5": "Fireball", "6": "Tamed Pet Passive (DND)"}


def test_spell_names_are_sorted_unique_and_limited_to_the_lines() -> None:
    assert spell_names(ABILITIES, SPELL_NAMES, {355, 354}) == ["Banish", "Corruption"]


def test_placeholder_spells_are_dropped() -> None:
    assert spell_names(ABILITIES, SPELL_NAMES, {205, 355}) == ["Corruption", "Seduction"]


def test_stones_keep_every_rank_and_nothing_else() -> None:
    items = [
        {"Display_lang": n}
        for n in (
            "Major Healthstone", "Healthstone", "Healthstone", "Soulstone",
            "Spellstone", "Grimoire of Create Soulstone", "Amberhall's Soulstone",
        )
    ]
    assert stone_names(items) == ["Healthstone", "Major Healthstone", "Soulstone"]


def test_potions_keep_every_rank_and_nothing_else() -> None:
    items = [
        {"Display_lang": n}
        for n in (
            "Minor Healing Potion", "Healing Potion", "Superior Healing Potion", "Major Healing Potion",
            "Major Discolored Healing Potion", "Manual: Greater Healing Potion", "Healing Potion Recipe",
        )
    ]
    assert potion_names(items) == ["Healing Potion", "Major Healing Potion", "Minor Healing Potion", "Superior Healing Potion"]


def test_a_renumbered_skill_line_fails_loudly() -> None:
    lines = [{"ID": "355", "DisplayName_lang": "Affliction"}]
    check_skill_lines(lines, {355: "Affliction"})
    with pytest.raises(SystemExit, match="354"):
        check_skill_lines(lines, {354: "Demonology"})


@pytest.fixture(scope="module")
def names() -> dict:
    return json.loads(Path(OUT_PATH).read_text(encoding="utf-8"))


class TestCommittedNames:
    def test_has_the_core_warlock_spells(self, names: dict) -> None:
        assert {"Shadow Bolt", "Fear", "Corruption", "Life Tap", "Drain Soul", "Create Healthstone"} <= set(names["spells"])

    def test_has_the_pet_abilities_the_macros_use(self, names: dict) -> None:
        assert {"Seduction", "Spell Lock", "Suffering", "Sacrifice"} <= set(names["petSpells"])

    def test_has_every_healthstone_rank_name(self, names: dict) -> None:
        assert {"Minor Healthstone", "Major Healthstone", "Soulstone"} <= set(names["items"])

    def test_has_the_wand_ability_and_the_spells_the_new_macros_use(self, names: dict) -> None:
        assert names["generalSpells"] == ["Shoot"]
        assert {
            "Curse of Weakness", "Curse of Tongues", "Health Funnel", "Fel Domination",
            "Ritual of Summoning", "Summon Voidwalker",
        } <= set(names["spells"])
        assert "Devour Magic" in names["petSpells"]

    def test_has_every_healing_potion_rank_the_macros_use(self, names: dict) -> None:
        assert {
            "Major Healing Potion", "Superior Healing Potion", "Greater Healing Potion",
            "Healing Potion", "Lesser Healing Potion", "Minor Healing Potion",
        } <= set(names["potions"])
