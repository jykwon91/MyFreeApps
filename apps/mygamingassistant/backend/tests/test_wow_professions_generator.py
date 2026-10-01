"""WoW Forever crafting-guide generator — recipe records, Forever-vs-Classic
changes, the trainer learn-skill estimate, and sanity checks on the committed
data it produced.

Known values are from the Forever beta client (1.60.1.69977): Bolt of Linen
Cloth is yellow at 25 and grey at 50; Heavy Linen Gloves moved from Classic's
60 / 95 to 50 / 85; Dust to Motes is new and needs a Runed Copper Rod.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_professions.crafts import (
    ClientRecipes,
    Items,
    _changes,
    build_recipes,
    forever_trainer_skill,
)

CRAFTING_DATA = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "professions" / "crafting"
)

BOLT, GLOVES, MOTES = 2963, 3840, 1245320
LINEN, BOLT_ITEM, THREAD, GLOVES_ITEM, MOTE, ROD = 2589, 2996, 2320, 4307, 247786, 6218


@pytest.fixture
def items() -> Items:
    return Items(
        names={
            LINEN: "Linen Cloth", BOLT_ITEM: "Bolt of Linen Cloth", THREAD: "Coarse Thread",
            GLOVES_ITEM: "Heavy Linen Gloves", MOTE: "Mote of Magic",
        },
        quality={BOLT_ITEM: 1, GLOVES_ITEM: 2, MOTE: 1},
        item_class={BOLT_ITEM: 7, GLOVES_ITEM: 4, MOTE: 7},
    )


@pytest.fixture
def forever() -> ClientRecipes:
    return ClientRecipes(
        abilities={BOLT: (25, 50, True), GLOVES: (50, 85, False), MOTES: (10, 15, True)},
        names={BOLT: "Bolt of Linen Cloth", GLOVES: "Heavy Linen Gloves", MOTES: "Dust to Motes"},
        reagents={BOLT: [(LINEN, 2)], GLOVES: [(BOLT_ITEM, 2), (THREAD, 1)], MOTES: [(10940, 1)]},
        creates={BOLT: (BOLT_ITEM, 1), GLOVES: (GLOVES_ITEM, 1), MOTES: (MOTE, 3)},
        tools={MOTES: (ROD, "Runed Copper Rod")},
    )


@pytest.fixture
def era() -> ClientRecipes:
    return ClientRecipes(
        abilities={BOLT: (25, 50, True), GLOVES: (60, 95, False)},
        names={BOLT: "Bolt of Linen Cloth", GLOVES: "Heavy Linen Gloves"},
        reagents={BOLT: [(LINEN, 2)], GLOVES: [(BOLT_ITEM, 2), (THREAD, 2)]},
        creates={BOLT: (BOLT_ITEM, 1), GLOVES: (GLOVES_ITEM, 1)},
    )


class TestChanges:
    def test_new_recipe_is_none(self, forever: ClientRecipes, era: ClientRecipes) -> None:
        assert _changes(MOTES, forever, era) is None

    def test_unchanged_recipe_is_empty(self, forever: ClientRecipes, era: ClientRecipes) -> None:
        assert _changes(BOLT, forever, era) == []

    def test_skill_and_reagent_changes(self, forever: ClientRecipes, era: ClientRecipes) -> None:
        assert _changes(GLOVES, forever, era) == ["skill", "reagents"]


class TestBuildRecipes:
    def test_records(self, forever: ClientRecipes, era: ClientRecipes, items: Items) -> None:
        by_spell = {r["spell"]: r for r in build_recipes(forever, era, items)}

        bolt = by_spell[BOLT]
        assert bolt["learn"] == {"source": "start", "skill": 1}
        assert "classic" not in bolt and "newInForever" not in bolt and "disenchantable" not in bolt

        gloves = by_spell[GLOVES]
        assert gloves["disenchantable"] is True
        assert gloves["learn"] == {"source": "trainer"}
        assert gloves["classic"]["yellow"] == 60 and gloves["classic"]["grey"] == 95
        assert [r["count"] for r in gloves["classic"]["reagents"]] == [2, 2]

        motes = by_spell[MOTES]
        assert motes["newInForever"] is True
        assert motes["tool"] == {"id": ROD, "name": "Runed Copper Rod"}
        assert motes["creates"]["count"] == 3

    def test_sorted_by_grey(self, forever: ClientRecipes, era: ClientRecipes, items: Items) -> None:
        assert [r["spell"] for r in build_recipes(forever, era, items)] == [MOTES, BOLT, GLOVES]

    def test_teaching_item_wins_over_trainer(self, forever: ClientRecipes, era: ClientRecipes, items: Items) -> None:
        taught = Items(**{**items.__dict__, "taught_by": {GLOVES: (9999, "Pattern: Heavy Linen Gloves", 45)}})
        gloves = next(r for r in build_recipes(forever, era, taught) if r["spell"] == GLOVES)
        assert gloves["learn"] == {
            "source": "item", "skill": 45, "itemId": 9999, "item": "Pattern: Heavy Linen Gloves",
        }


class TestForeverTrainerSkill:
    def test_shifts_with_yellow(self) -> None:
        assert forever_trainer_skill(40, {"yellow": 50, "classic": {"yellow": 60}}) == 30

    def test_unchanged_recipe_keeps_classic(self) -> None:
        assert forever_trainer_skill(10, {"yellow": 50}) == 10

    def test_clamped_to_yellow_and_one(self) -> None:
        assert forever_trainer_skill(80, {"yellow": 50}) == 50
        assert forever_trainer_skill(5, {"yellow": 20, "classic": {"yellow": 40}}) == 1


def _recipes(profession: str) -> dict[int, dict]:
    data = json.loads((CRAFTING_DATA / f"{profession}.json").read_text(encoding="utf-8"))
    return {r["spell"]: r for r in data["recipes"]}


@pytest.fixture(scope="module")
def tailoring() -> dict[int, dict]:
    return _recipes("tailoring")


@pytest.fixture(scope="module")
def enchanting() -> dict[int, dict]:
    return _recipes("enchanting")


class TestCommittedData:
    def test_bolt_of_linen(self, tailoring: dict[int, dict]) -> None:
        bolt = tailoring[BOLT]
        assert (bolt["yellow"], bolt["grey"]) == (25, 50)
        assert bolt["learn"]["source"] == "start"

    def test_heavy_linen_gloves_moved(self, tailoring: dict[int, dict]) -> None:
        gloves = tailoring[GLOVES]
        assert (gloves["yellow"], gloves["grey"]) == (50, 85)
        assert (gloves["classic"]["yellow"], gloves["classic"]["grey"]) == (60, 95)

    def test_dust_to_motes_needs_the_rod(self, enchanting: dict[int, dict]) -> None:
        motes = enchanting[MOTES]
        assert motes["newInForever"] is True
        assert motes["tool"]["id"] == ROD

    def test_every_trainer_recipe_has_an_estimate(self, tailoring: dict[int, dict], enchanting: dict[int, dict]) -> None:
        skills = json.loads((CRAFTING_DATA / "classic" / "trainerSkills.json").read_text(encoding="utf-8"))
        for name, recipes in (("tailoring", tailoring), ("enchanting", enchanting)):
            for spell, entry in skills[name].items():
                recipe = recipes[int(spell)]
                assert recipe["learn"]["source"] == "trainer"
                assert 1 <= entry["forever"] <= recipe["yellow"]

    def test_cmangos_license_kept(self) -> None:
        assert (CRAFTING_DATA / "classic" / "LICENSE").is_file()
        assert "cmangos" in (CRAFTING_DATA / "classic" / "README.md").read_text(encoding="utf-8")
