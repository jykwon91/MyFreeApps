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

from scripts.wow_food.recipe_sources import MIN_FARM_CHANCE, VENDOR_COLUMNS, _stock, territory_of
from scripts.wow_professions.build import DISENCHANT_COLUMNS, _best_giver, _disenchant_kind, _roll_chances
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


def _loot(item: int, chance: float, group: int = 1) -> dict:
    return {"item": item, "ChanceOrQuestChance": chance, "groupid": group}


class TestDisenchantSources:
    def test_unset_chance_shares_what_the_group_leaves(self) -> None:
        # Classic table 4 (level 21-25 green armour): 75% Soul Dust, 20% essence, the shard takes the rest.
        chances = _roll_chances([_loot(11083, 75), _loot(11082, 20), _loot(11084, 0)])
        assert chances == {11083: 75, 11082: 20, 11084: 5}

    def test_shields_and_off_hands_count_with_weapons(self) -> None:
        def kind(cls: int, subclass: int = 0, inventory: int = 0) -> str | None:
            return _disenchant_kind({"class": cls, "subclass": subclass, "InventoryType": inventory})

        assert kind(2) == "weapon"
        assert kind(4, subclass=6) == "weapon"  # shield
        assert kind(4, inventory=23) == "weapon"  # held in off-hand
        assert kind(4, subclass=2, inventory=5) == "armor"
        assert kind(7) is None

    def test_best_giver_names_the_type_only_when_most_are_one(self) -> None:
        assert _best_giver([("armor", 75), ("armor", 75), ("weapon", 20)]) == [75, "armor"]
        assert _best_giver([("armor", 75), ("weapon", 75)]) == [75, None]

    def test_committed_disenchant_bands(self) -> None:
        data = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))
        assert data["disenchantColumns"] == DISENCHANT_COLUMNS
        de = data["disenchant"]
        assert de["11083"] == [21, 30, 75, "armor", False]  # Soul Dust
        assert de["10938"][3] == "weapon"  # Lesser Magic Essence
        assert de["11084"][4] is True  # Large Glimmering Shard: every blue gives one
        for row in de.values():
            assert 1 <= row[0] <= row[1] <= 60

    def test_committed_skinning(self) -> None:
        reagents = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))["reagents"]
        assert reagents["8170"]["skinning"]["levels"][0] >= 40  # Rugged Leather
        assert "skinning" not in reagents["2592"]  # sheep don't make Wool Cloth a skinning mat


class TestVendorStock:
    def test_stock_and_restock_from_maxcount_and_incrtime(self) -> None:
        assert _stock({"maxcount": 2, "incrtime": 7200}) == (2, 120)
        assert _stock({"maxcount": 0, "incrtime": 0}) == (0, 0)

    def test_committed_enchanting_supplier_stock(self) -> None:
        data = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))
        assert data["vendorColumns"] == VENDOR_COLUMNS
        tilli = [v for v in data["reagents"]["10938"]["vendors"] if v[1] == "Tilli Thistlefuzz"]
        assert tilli and tilli[0][-2:] == [2, 120]  # Lesser Magic Essence: 2 at a time, every 2 hours


class TestClothFarmSpots:
    @pytest.fixture(scope="class")
    def sources(self) -> dict:
        return json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))

    def test_wool_cloth_gets_a_farm_spot_per_zone(self, sources: dict) -> None:
        drop = sources["reagents"]["2592"]["drop"]
        zones = [m[4] for m in drop["mobs"]]
        assert len(zones) >= 5 and len(set(zones)) == len(zones)
        assert len({m[0] for m in drop["mobs"]}) == len(drop["mobs"])  # a different mob in each zone
        assert all(m[3] >= MIN_FARM_CHANCE for m in drop["mobs"])

    def test_every_mob_for_a_non_cloth_drop(self, sources: dict) -> None:
        # Spider's Silk: each mob has its own chance, so all of them are listed, not the top 3.
        drop = sources["reagents"]["3182"]["drop"]
        assert len(drop["mobs"]) > 20
        assert all(m[3] >= 1.0 for m in drop["mobs"])

    def test_spots_carry_territory(self, sources: dict) -> None:
        territory = sources["territory"]
        sides = {territory[str(m[4])] for m in sources["reagents"]["2589"]["drop"]["mobs"]}
        assert sides >= {"alliance", "horde"}  # Linen Cloth: a starting zone for each side

    def test_no_guards_or_elites(self, sources: dict) -> None:
        names = {m[0] for i in ("2589", "2592", "4306", "4338", "14047") for m in sources["reagents"][i]["drop"]["mobs"]}
        assert not names & {"Refuge Pointe Defender", "Nethergarde Soldier", "Horde Scout", "Felguard Elite"}

    def test_territory_of_counts_capitals_as_their_faction(self) -> None:
        zones = [{"id": 1, "territory": "contested"}, {"id": 2, "faction": "A"}, {"id": 3}]
        assert territory_of([3, 2, 1], zones) == {"1": "contested", "2": "alliance"}
