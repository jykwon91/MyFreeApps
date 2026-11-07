"""WoW Forever per-class spell names for the Guide's macros — line ownership, and the committed JSON."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_class_spells.build import CLASS_LINES, CLASS_MASKS, OUT_PATH, check_line_owners
from scripts.wow_refresh.report import SECTIONS, diff_section

CLASS_SPELLS = next(s for s in SECTIONS if s.title == "Class spells (Guide macros)")


def _owned_rows() -> list[dict[str, str]]:
    return [
        {"SkillID": str(line_id), "ClassMask": str(CLASS_MASKS[cls])}
        for cls, lines in CLASS_LINES.items()
        for line_id in lines
    ]


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


def test_refresh_report_names_class_and_spell() -> None:
    old = {"classes": {"priest": ["Renew"]}}
    new = {"classes": {"priest": ["Renew", "Penance"]}}
    assert diff_section(CLASS_SPELLS, old, new) == ["- added: Penance (priest)"]


@pytest.fixture(scope="module")
def names() -> dict:
    return json.loads(Path(OUT_PATH).read_text(encoding="utf-8"))


class TestCommittedNames:
    def test_has_every_class(self, names: dict) -> None:
        assert set(names["classes"]) == set(CLASS_LINES)

    def test_has_the_core_heals_and_dispels(self, names: dict) -> None:
        classes = names["classes"]
        assert {"Rejuvenation", "Regrowth", "Remove Curse", "Abolish Poison"} <= set(classes["druid"])
        assert {"Flash of Light", "Holy Light", "Cleanse", "Purify"} <= set(classes["paladin"])
        assert {"Flash Heal", "Renew", "Power Word: Shield", "Dispel Magic"} <= set(classes["priest"])
        assert {"Healing Wave", "Chain Heal", "Cure Poison", "Earth Shock"} <= set(classes["shaman"])

    def test_forever_renamed_curse_of_agony(self, names: dict) -> None:
        assert "Bane of Agony" in names["classes"]["warlock"]
        assert "Curse of Agony" not in names["classes"]["warlock"]
