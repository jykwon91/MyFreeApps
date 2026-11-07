"""WoW Forever macro names — selection rules, line ownership, the refresh report, and the committed JSON."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from scripts.wow_macros.build import (
    CLASS_LINES,
    CLASS_MASKS,
    OUT_PATH,
    PET_LINES,
    check_line_owners,
    check_skill_lines,
    class_line_ids,
    item_names,
    spell_names,
)
from scripts.wow_refresh.report import SECTIONS, diff_section

MACRO_SPELLS = next(s for s in SECTIONS if s.title == "Macro spells (class + pet)")
MACRO_ITEMS = next(s for s in SECTIONS if s.title == "Macro items")

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


def _owned_rows() -> list[dict[str, str]]:
    return [
        {"SkillID": str(line_id), "ClassMask": str(CLASS_MASKS[cls])}
        for cls, lines in CLASS_LINES.items()
        for line_id in lines
    ]


def test_spell_names_are_sorted_unique_and_limited_to_the_lines() -> None:
    assert spell_names(ABILITIES, SPELL_NAMES, {355, 354}) == ["Banish", "Corruption"]


def test_placeholder_spells_are_dropped() -> None:
    assert spell_names(ABILITIES, SPELL_NAMES, {205, 355}) == ["Corruption", "Seduction"]


def test_a_class_includes_its_pets_lines() -> None:
    assert class_line_ids("warlock") == set(CLASS_LINES["warlock"]) | set(PET_LINES["warlock"])
    assert class_line_ids("priest") == set(CLASS_LINES["priest"])


def test_items_keep_every_stone_and_potion_rank_and_nothing_else() -> None:
    items = [
        {"Display_lang": n}
        for n in (
            "Major Healthstone", "Healthstone", "Healthstone", "Soulstone", "Spellstone",
            "Grimoire of Create Soulstone", "Amberhall's Soulstone", "Minor Healing Potion",
            "Superior Healing Potion", "Major Discolored Healing Potion", "Manual: Greater Healing Potion",
        )
    ]
    assert item_names(items) == [
        "Healthstone", "Major Healthstone", "Minor Healing Potion", "Soulstone", "Superior Healing Potion",
    ]


def test_a_renumbered_skill_line_fails_loudly() -> None:
    lines = [{"ID": "355", "DisplayName_lang": "Affliction"}]
    check_skill_lines(lines, {355: "Affliction"})
    with pytest.raises(SystemExit, match="354"):
        check_skill_lines(lines, {354: "Demonology"})


def test_every_line_owned_by_its_class_passes() -> None:
    check_line_owners(_owned_rows())


def test_a_line_owned_by_another_class_fails_loudly() -> None:
    rows = _owned_rows()
    # Priest Holy (56) handed to the Paladin, the swap that two "Holy" lines invite.
    for row in rows:
        if row["SkillID"] == "56":
            row["ClassMask"] = str(CLASS_MASKS["paladin"])
    with pytest.raises(SystemExit, match="56"):
        check_line_owners(rows)


def test_refresh_report_names_class_spell_and_item() -> None:
    assert diff_section(MACRO_SPELLS, {"classes": {"priest": ["Renew"]}}, {"classes": {"priest": ["Renew", "Penance"]}}) == [
        "- added: Penance (priest)"
    ]
    assert diff_section(MACRO_ITEMS, {"items": ["Healthstone"]}, {"items": []}) == ["- removed: Healthstone"]


@pytest.fixture(scope="module")
def names() -> dict:
    return json.loads(Path(OUT_PATH).read_text(encoding="utf-8"))


class TestCommittedNames:
    def test_has_every_class(self, names: dict) -> None:
        assert set(names["classes"]) == set(CLASS_LINES)

    def test_has_the_core_heals_dispels_and_interrupts(self, names: dict) -> None:
        classes = names["classes"]
        assert {"Rejuvenation", "Regrowth", "Remove Curse", "Abolish Poison"} <= set(classes["druid"])
        assert {"Flash of Light", "Holy Light", "Cleanse", "Purify"} <= set(classes["paladin"])
        assert {"Flash Heal", "Renew", "Power Word: Shield", "Dispel Magic"} <= set(classes["priest"])
        assert {"Healing Wave", "Chain Heal", "Cure Poison", "Earth Shock"} <= set(classes["shaman"])
        assert {"Taunt", "Pummel", "Shield Bash"} <= set(classes["warrior"])
        assert {"Kick", "Blind", "Sap"} <= set(classes["rogue"])

    def test_has_the_warlock_spells_and_pet_abilities(self, names: dict) -> None:
        warlock = set(names["classes"]["warlock"])
        assert {
            "Shadow Bolt", "Fear", "Corruption", "Life Tap", "Drain Soul", "Create Healthstone", "Curse of Weakness",
            "Curse of Tongues", "Health Funnel", "Fel Domination", "Ritual of Summoning", "Summon Voidwalker",
        } <= warlock
        assert {"Seduction", "Spell Lock", "Suffering", "Sacrifice", "Devour Magic"} <= warlock

    def test_forever_renamed_curse_of_agony(self, names: dict) -> None:
        assert "Bane of Agony" in names["classes"]["warlock"]
        assert "Curse of Agony" not in names["classes"]["warlock"]

    def test_has_the_wand_and_every_stone_and_potion_rank(self, names: dict) -> None:
        assert names["generalSpells"] == ["Shoot"]
        assert {
            "Minor Healthstone", "Major Healthstone", "Soulstone", "Major Soulstone",
            "Major Healing Potion", "Superior Healing Potion", "Greater Healing Potion",
            "Healing Potion", "Lesser Healing Potion", "Minor Healing Potion",
        } <= set(names["items"])
