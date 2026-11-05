"""WoW Forever Engineering guide generator — the item tooltip lines, rolled
amounts, and sanity checks on the committed engineering.json.

Known values: Rough Dynamite's damage effect (spell 4054) is base 30 with
Variance 0.2667 in the Forever client, and base 25 with 9 die sides in the
Classic Era client — both read "26 to 34", as the game shows it. Solid
Dynamite's (12419) is 250 / 0.296 in Forever and 212 + 1d75 in Era: 213 to 287.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_food.tooltip import Effect, SpellBook, evaluate, roll_range
from scripts.wow_professions.effects import add_effects, item_effect

CRAFTING_DATA = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting"
)

SCHOOL_DAMAGE = 2
ROUGH_DYNAMITE_ITEM, ROUGH_DYNAMITE_SPELL, COPPER_TUBE_ITEM = 4358, 4054, 4361


def _effect(bp: float, variance: float = 0.0) -> Effect:
    return Effect(index=0, effect=SCHOOL_DAMAGE, aura=0, base_points=bp, misc=0, period_ms=0, trigger=0, variance=variance)


@pytest.fixture
def book() -> SpellBook:
    return SpellBook(
        descriptions={
            ROUGH_DYNAMITE_SPELL: "Inflicts $s1 Fire damage in a 5 yard radius.",
            1: "",
            2: "Lasts $d.",
            3: "Increases your damage by $s1.",
        },
        effects={ROUGH_DYNAMITE_SPELL: [_effect(30, 0.2667)], 3: [_effect(5)]},
    )


class TestRollRange:
    @pytest.mark.parametrize(
        ("base", "variance", "era_base", "era_die"),
        [(30, 0.2667, 25, 9), (175, 0.4914, 131, 87), (250, 0.296, 212, 75)],
    )
    def test_matches_the_classic_dice(self, base: float, variance: float, era_base: int, era_die: int) -> None:
        assert roll_range(_effect(base, variance)) == f"{era_base + 1} to {era_base + era_die}"

    def test_a_fixed_amount_stays_one_number(self) -> None:
        assert roll_range(_effect(5)) == "5"

    def test_tooltip_reads_the_range(self, book: SpellBook) -> None:
        assert evaluate(book, ROUGH_DYNAMITE_SPELL) == "Inflicts 26 to 34 Fire damage in a 5 yard radius."
        assert evaluate(book, 3) == "Increases your damage by 5."


class TestItemEffect:
    def test_first_clean_tooltip(self, book: SpellBook) -> None:
        assert item_effect(ROUGH_DYNAMITE_ITEM, book, {ROUGH_DYNAMITE_ITEM: [1, 2, ROUGH_DYNAMITE_SPELL]}) == (
            "Inflicts 26 to 34 Fire damage in a 5 yard radius."
        )

    def test_none_when_blank_or_unresolved(self, book: SpellBook) -> None:
        assert item_effect(COPPER_TUBE_ITEM, book, {COPPER_TUBE_ITEM: [1, 2]}) is None
        assert item_effect(COPPER_TUBE_ITEM, book, {}) is None

    def test_add_effects_only_where_there_is_one(self, book: SpellBook) -> None:
        recipes = [
            {"spell": 3919, "creates": {"id": ROUGH_DYNAMITE_ITEM}},
            {"spell": 3924, "creates": {"id": COPPER_TUBE_ITEM}},
            {"spell": 7421, "enchant": True},
        ]
        add_effects(recipes, book, {ROUGH_DYNAMITE_ITEM: [ROUGH_DYNAMITE_SPELL]})
        assert recipes[0]["effect"].startswith("Inflicts 26 to 34")
        assert "effect" not in recipes[1] and "effect" not in recipes[2]


@pytest.fixture(scope="module")
def engineering_file() -> dict:
    return json.loads((CRAFTING_DATA / "engineering.json").read_text(encoding="utf-8"))


ROUGH_DYNAMITE, SOLID_DYNAMITE, COPPER_TUBE, SHRINK_RAY, JUMPER_CABLES_XL = 3919, 12586, 3924, 12899, 23078
GNOMISH, GOBLIN = 20219, 20222
COPPER_BAR, MITHRIL_BAR = 2840, 3860


class TestCommittedEngineering:
    def test_effect_lines_from_the_client(self, engineering_file: dict) -> None:
        recipes = {r["spell"]: r for r in engineering_file["recipes"]}
        assert recipes[ROUGH_DYNAMITE]["effect"] == "Inflicts 26 to 34 Fire damage in a 5 yard radius."
        assert recipes[SOLID_DYNAMITE]["effect"].startswith("Inflicts 213 to 287 Fire damage")
        assert "effect" not in recipes[COPPER_TUBE]
        assert all("$" not in r["effect"] for r in recipes.values() if "effect" in r)

    def test_specialist_recipes(self, engineering_file: dict) -> None:
        recipes = {r["spell"]: r for r in engineering_file["recipes"]}
        assert recipes[SHRINK_RAY]["spec"] == GNOMISH
        assert recipes[JUMPER_CABLES_XL]["spec"] == GOBLIN
        assert "spec" not in recipes[ROUGH_DYNAMITE]

    def test_specializations_with_their_classic_quests(self, engineering_file: dict) -> None:
        by_spell = {s["spell"]: s for s in engineering_file["specs"]}
        assert set(by_spell) == {GNOMISH, GOBLIN}
        assert {q["id"] for q in by_spell[GNOMISH]["quests"]} == {3641, 3643}
        assert {q["id"] for q in by_spell[GOBLIN]["quests"]} == {3639}
        assert all(q["skill"] == 200 and q["level"] == 30 for s in by_spell.values() for q in s["quests"])

    def test_smelting_for_the_bars(self, engineering_file: dict) -> None:
        smelting = engineering_file["smelting"]
        assert smelting[0]["creates"]["id"] == COPPER_BAR and smelting[0]["skill"] == 1
        assert MITHRIL_BAR in {s["creates"]["id"] for s in smelting}

    def test_other_professions_carry_no_effect_lines(self) -> None:
        blacksmithing = json.loads((CRAFTING_DATA / "blacksmithing.json").read_text(encoding="utf-8"))
        assert not any("effect" in r for r in blacksmithing["recipes"])
