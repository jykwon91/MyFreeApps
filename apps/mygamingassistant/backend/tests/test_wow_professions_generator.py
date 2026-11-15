"""WoW Forever crafting-guide generator — recipe records, Forever-vs-Classic
changes, the trainer learn-skill estimate, and sanity checks on the committed
data it produced.

Known values are from the Forever client: Bolt of Linen
Cloth is yellow at 25 and grey at 50; Heavy Linen Gloves moved from Classic's
60 / 95 to 50 / 85; Dust to Motes is new and needs a Runed Copper Rod.
"""
from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from scripts.wow_food import recipe_sources
from scripts.wow_food.recipe_sources import (
    MIN_FARM_CHANCE,
    VENDOR_COLUMNS,
    _gather_locks,
    _stock,
    territory_of,
)
from scripts.wow_professions import build as professions_build
from scripts.wow_professions import specs
from scripts.wow_professions.build import (
    DISENCHANT_COLUMNS,
    _best_giver,
    _by_recipe,
    _disenchant_kind,
    _recipes_taught,
    _roll_chances,
    era_teaching_items,
    gossip_teachers,
    quest_teachers,
    with_child_skill_lines,
)
from scripts.wow_professions.crafts import (
    ClassicTeaching,
    ClientRecipes,
    Items,
    _changes,
    build_recipes,
    classic_learn,
    classic_source,
    forever_trainer_skill,
    mining_records,
    smelting_for,
    sod_only_spells,
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
def classic() -> ClassicTeaching:
    """Classic trainers teach Heavy Linen Gloves; Classic has the Linen and Bolt items."""
    return ClassicTeaching(trainer=frozenset({GLOVES}), items=frozenset({LINEN, BOLT_ITEM, GLOVES_ITEM}))


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
    def test_records(self, forever: ClientRecipes, era: ClientRecipes, items: Items, classic: ClassicTeaching) -> None:
        by_spell = {r["spell"]: r for r in build_recipes(forever, era, items, classic)}

        bolt = by_spell[BOLT]
        assert bolt["learn"] == {"source": "start", "skill": 1}
        assert "classic" not in bolt and "newInForever" not in bolt and "disenchantable" not in bolt

        gloves = by_spell[GLOVES]
        assert gloves["disenchantable"] is True
        assert gloves["creates"]["itemClass"] == 4 and bolt["creates"]["itemClass"] == 7
        assert gloves["learn"] == {"source": "trainer", "classic": "trainer"}
        assert gloves["classic"]["yellow"] == 60 and gloves["classic"]["grey"] == 95
        assert [r["count"] for r in gloves["classic"]["reagents"]] == [2, 2]

        motes = by_spell[MOTES]
        assert motes["newInForever"] is True
        assert motes["tool"] == {"id": ROD, "name": "Runed Copper Rod"}
        assert motes["creates"]["count"] == 3

    def test_sorted_by_grey(self, forever: ClientRecipes, era: ClientRecipes, items: Items, classic: ClassicTeaching) -> None:
        assert [r["spell"] for r in build_recipes(forever, era, items, classic)] == [MOTES, BOLT, GLOVES]

    def test_teaching_item_wins_over_trainer(
        self, forever: ClientRecipes, era: ClientRecipes, items: Items, classic: ClassicTeaching,
    ) -> None:
        taught = Items(**{**items.__dict__, "taught_by": {GLOVES: (9999, "Pattern: Heavy Linen Gloves", 45, 0)}})
        gloves = next(r for r in build_recipes(forever, era, taught, classic) if r["spell"] == GLOVES)
        assert gloves["learn"] == {
            "source": "item", "skill": 45, "itemId": 9999, "item": "Pattern: Heavy Linen Gloves", "classic": "trainer",
        }


# Season of Discovery filter. Real ids: Earthen Vest is trainer-taught (8764) and has a SoD copy
# (439100, no teacher); Enchanter's Cowl's Pattern 14630 is a Classic item, SoD's Crimson Silk
# Belt Pattern isn't; Elixir of Lion's Strength (2329) came with Classic Alchemy but Forever moved
# it to a trainer; Gordok Ogre Suit (22813) is taught by Knot Thimblejack's gossip script; Glacial
# Cloak (28208) by a Classic pattern the Forever item table lacks; Mooncloth Boots (19435) by the
# quest Sacred Cloth (6032); Dust to Motes is new in Forever.
VEST, SOD_VEST, COWL, SOD_BELT, LIONS, OGRE_SUIT, GLACIAL, MOONCLOTH_BOOTS, MOTES_NEW, BOLT_START = (
    8764, 439100, 3857, 439098, 2329, 22813, 28208, 19435, 1245320, 2963,
)
COWL_PATTERN, SOD_BELT_PATTERN, GLACIAL_PATTERN = 14630, 217258, 22685
FILTER_SPELLS = [VEST, SOD_VEST, COWL, SOD_BELT, LIONS, OGRE_SUIT, GLACIAL, MOONCLOTH_BOOTS]


@pytest.fixture
def sod_forever() -> ClientRecipes:
    abilities = {spell: (100, 130, False) for spell in FILTER_SPELLS}
    abilities |= {MOTES_NEW: (10, 15, False), BOLT_START: (25, 50, True)}
    return ClientRecipes(abilities=abilities, names={s: f"Recipe {s}" for s in abilities}, reagents={}, creates={})


@pytest.fixture
def sod_era() -> ClientRecipes:
    """The Classic Era client — shared with Season of Discovery, so its copies are here too."""
    abilities = {spell: (100, 130, spell == LIONS) for spell in FILTER_SPELLS} | {BOLT_START: (25, 50, True)}
    return ClientRecipes(abilities=abilities, names={}, reagents={}, creates={})


@pytest.fixture
def sod_items() -> Items:
    return Items(
        names={}, quality={}, item_class={},
        taught_by={
            COWL: (COWL_PATTERN, "Pattern: Enchanter's Cowl", 130, 0),
            SOD_BELT: (SOD_BELT_PATTERN, "Pattern: Crimson Silk Belt", 175, 0),
        },
    )


@pytest.fixture
def sod_classic() -> ClassicTeaching:
    return ClassicTeaching(
        trainer=frozenset({VEST}),
        items=frozenset({COWL_PATTERN, GLACIAL_PATTERN}),
        quest={MOONCLOTH_BOOTS: ((6032, "Sacred Cloth"),)},
        npc={OGRE_SUIT: ("Knot Thimblejack",), GLACIAL: ()},
        era_item={GLACIAL: (GLACIAL_PATTERN, "Pattern: Glacial Cloak", 100)},
    )


class TestSeasonOfDiscoveryFilter:
    def test_keeps_what_classic_or_forever_teaches(
        self, sod_forever: ClientRecipes, sod_era: ClientRecipes, sod_items: Items, sod_classic: ClassicTeaching,
    ) -> None:
        by_spell = {r["spell"]: r for r in build_recipes(sod_forever, sod_era, sod_items, sod_classic)}
        assert by_spell[VEST]["learn"] == {"source": "trainer", "classic": "trainer"}
        assert by_spell[COWL]["learn"]["source"] == "item" and by_spell[COWL]["learn"]["classic"] == "item"
        assert by_spell[LIONS]["learn"]["classic"] == "start"
        assert by_spell[OGRE_SUIT]["learn"]["classic"] == "npc"
        assert by_spell[GLACIAL]["learn"]["classic"] == "npc"
        assert by_spell[MOONCLOTH_BOOTS]["learn"]["classic"] == "quest"
        assert by_spell[MOTES_NEW]["newInForever"] is True and "classic" not in by_spell[MOTES_NEW]["learn"]
        assert by_spell[BOLT_START]["learn"] == {"source": "start", "skill": 1}

    def test_drops_season_of_discovery_copies(
        self, sod_forever: ClientRecipes, sod_era: ClientRecipes, sod_items: Items, sod_classic: ClassicTeaching,
    ) -> None:
        spells = {r["spell"] for r in build_recipes(sod_forever, sod_era, sod_items, sod_classic)}
        # The trainer-less copy, and the one whose pattern isn't a Classic item.
        assert SOD_VEST not in spells and SOD_BELT not in spells
        assert sod_only_spells(sod_forever, sod_era, sod_items, sod_classic) == {SOD_VEST, SOD_BELT}

    def test_classic_source_order(self, sod_era: ClientRecipes, sod_items: Items, sod_classic: ClassicTeaching) -> None:
        # A Classic teaching item says "item" even when a trainer teaches it too.
        both = ClassicTeaching(**{**sod_classic.__dict__, "trainer": frozenset({COWL})})
        assert classic_source(COWL, sod_era, sod_items, both) == "item"
        assert classic_source(SOD_BELT, sod_era, sod_items, sod_classic) is None
        assert classic_source(SOD_VEST, sod_era, sod_items, sod_classic) is None

    def test_recipes_taught_follows_learn_spells(self) -> None:
        # Knot's script casts 22814, which teaches the suit 22813.
        assert _recipes_taught({22814, 5}, {22814: [OGRE_SUIT]}) == {22814, OGRE_SUIT, 5}


class TestClassicLearn:
    """Recipes the Forever client names no teaching item for: learned where Classic taught them, not at a trainer."""

    def test_build_recipes_labels_where_classic_teaches(
        self, sod_forever: ClientRecipes, sod_era: ClientRecipes, sod_items: Items, sod_classic: ClassicTeaching,
    ) -> None:
        by_spell = {r["spell"]: r for r in build_recipes(sod_forever, sod_era, sod_items, sod_classic)}
        assert by_spell[OGRE_SUIT]["learn"] == {"source": "npc", "npcs": ["Knot Thimblejack"], "classic": "npc"}
        assert by_spell[MOONCLOTH_BOOTS]["learn"] == {
            "source": "quest", "quests": [{"id": 6032, "title": "Sacred Cloth"}], "classic": "quest",
        }
        # Nobody named teaches the Glacial Cloak, so its Classic pattern does.
        assert by_spell[GLACIAL]["learn"] == {
            "source": "item", "skill": 100, "itemId": GLACIAL_PATTERN, "item": "Pattern: Glacial Cloak", "classic": "npc",
        }
        # A Classic trainer's recipe and one that came with Classic's skill stay at the trainer.
        assert by_spell[VEST]["learn"] == {"source": "trainer", "classic": "trainer"}
        assert by_spell[LIONS]["learn"] == {"source": "trainer", "classic": "start"}

    def test_trainer_recipe_stays_at_the_trainer(self) -> None:
        classic = ClassicTeaching(trainer=frozenset({1}), items=frozenset(), era_item={1: (10, "Pattern: X", 50)})
        assert classic_learn(1, {"yellow": 50}, classic) is None

    def test_strongest_evidence_first(self) -> None:
        quest = {1: ((7, "Quest"),)}
        npc = {1: ("Knot Thimblejack",)}
        era_item = {1: (10, "Pattern: X", 50)}
        record = {"yellow": 50}
        sourced = ClassicTeaching(trainer=frozenset(), items=frozenset(), quest=quest, npc=npc, era_item=era_item, sourced=frozenset({10}))
        assert classic_learn(1, record, sourced)["source"] == "item"
        unsourced = replace(sourced, sourced=frozenset())
        assert classic_learn(1, record, unsourced)["source"] == "quest"
        assert classic_learn(1, record, replace(unsourced, quest={}))["npcs"] == ["Knot Thimblejack"]
        assert classic_learn(1, record, replace(unsourced, quest={}, npc={}))["itemId"] == 10
        assert classic_learn(1, record, replace(unsourced, quest={}, npc={1: ()}))["itemId"] == 10
        assert classic_learn(1, record, replace(unsourced, quest={}, npc={}, era_item={})) is None

    def test_era_pattern_skill_moves_with_the_recipe(self) -> None:
        classic = ClassicTeaching(trainer=frozenset(), items=frozenset(), era_item={1: (10, "Pattern: Felcloth Bag", 285)})
        moved = classic_learn(1, {"yellow": 260, "classic": {"yellow": 300}}, classic)
        assert moved == {"source": "item", "skill": 245, "itemId": 10, "item": "Pattern: Felcloth Bag", "estimated": True}
        unchanged = classic_learn(1, {"yellow": 300}, classic)
        assert unchanged == {"source": "item", "skill": 285, "itemId": 10, "item": "Pattern: Felcloth Bag"}

    def test_by_recipe_follows_learn_spells_in_order(self) -> None:
        assert _by_recipe({5: ["a", "b"], 3: ["b"]}, {5: [9]}) == {3: ("b",), 5: ("a", "b"), 9: ("a", "b")}

    def test_quest_teachers(self) -> None:
        quests = [
            {"entry": "7497", "Title": "The Journey Has Just Begun", "RewSpell": "19094", "RewSpellCast": "0"},
            {"entry": "7493", "Title": "The Journey Has Just Begun", "RewSpell": "0", "RewSpellCast": "19094"},
            {"entry": "1", "Title": "No spell", "RewSpell": "0", "RewSpellCast": "0"},
        ]
        assert quest_teachers(quests) == {
            19094: [(7493, "The Journey Has Just Begun"), (7497, "The Journey Has Just Begun")],
        }

    def test_gossip_teachers_name_the_npc_or_object(self) -> None:
        tables = {
            "creature_template": [{"Entry": "14338", "Name": "Knot Thimblejack", "GossipMenuId": "5667"}],
            "gameobject_template": [
                {"entry": "180794", "type": "2", "name": "Journal of Jandice Barov", "data3": "6799"},
                # A chest's data1 is its loot, not a gossip menu.
                {"entry": "142344", "type": "3", "name": "Artificial Extrapolator", "data3": "6799"},
            ],
            "gossip_menu_option": [
                {"menu_id": "5667", "action_script_id": "566701"},
                {"menu_id": "6799", "action_script_id": "6799"},
                {"menu_id": "24401", "action_script_id": "244011"},
            ],
            "gossip_menu": [{"entry": "5667", "script_id": "0"}],
            "dbscripts_on_gossip": [
                {"id": "566701", "command": "15", "datalong": "22814"},
                {"id": "6799", "command": "15", "datalong": "26095"},
                {"id": "244011", "command": "15", "datalong": "28210"},
                {"id": "566701", "command": "0", "datalong": "999"},
            ],
        }
        assert gossip_teachers(tables) == {
            22814: ["Knot Thimblejack"], 26095: ["Journal of Jandice Barov"], 28210: [],
        }

    def test_era_teaching_items_keep_classic_patterns(self, monkeypatch: pytest.MonkeyPatch) -> None:
        rows = {
            "ItemSparse": [
                {"ID": "21369", "Display_lang": "Pattern: Felcloth Bag", "RequiredSkillRank": "285"},
                {"ID": "236691", "Display_lang": "Pattern: Glacial Cloak", "RequiredSkillRank": "300"},
                {"ID": "22685", "Display_lang": "Pattern: Glacial Cloak", "RequiredSkillRank": "300"},
                {"ID": "500", "Display_lang": "Not a pattern", "RequiredSkillRank": "0"},
            ],
            "ItemEffect": [
                {"ParentItemID": "21369", "SpellID": "26095"},
                {"ParentItemID": "236691", "SpellID": "28210"},
                {"ParentItemID": "22685", "SpellID": "28210"},
                {"ParentItemID": "500", "SpellID": "77"},
            ],
        }
        monkeypatch.setattr(professions_build, "wago_table", lambda name, **_: rows[name])
        found = era_teaching_items(frozenset({21369, 22685, 500}), {26095: [26086], 28210: [28208]}, {})
        assert found[26086] == (21369, "Pattern: Felcloth Bag", 285)
        # Season of Discovery's 236691 isn't a Classic item.
        assert found[28208] == (22685, "Pattern: Glacial Cloak", 300)
        assert 77 not in found


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


@pytest.fixture(scope="module")
def alchemy() -> dict[int, dict]:
    return _recipes("alchemy")


@pytest.fixture(scope="module")
def first_aid() -> dict[int, dict]:
    return _recipes("firstaid")


ELIXIR_OF_MINOR_DEFENSE, TRANSMUTE_IRON_TO_GOLD, MINOR_ARCANE_ELIXIR = 7183, 11479, 1245246
LINEN_BANDAGE, HEAVY_SILK_BANDAGE, HEAVY_RUNECLOTH_BANDAGE = 3275, 7929, 18630
HEALING_POTION_SPELL, HEALING_POTION_ITEM = 1244433, 929


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

    def test_alchemy_from_the_forever_client(self, alchemy: dict[int, dict]) -> None:
        defense = alchemy[ELIXIR_OF_MINOR_DEFENSE]
        assert defense["learn"]["source"] == "start"
        assert (defense["yellow"], defense["grey"]) == (55, 95)
        assert alchemy[MINOR_ARCANE_ELIXIR]["newInForever"] is True
        transmute = alchemy[TRANSMUTE_IRON_TO_GOLD]
        assert transmute["learn"]["source"] == "item" and transmute["learn"]["item"].startswith("Recipe: ")

    def test_every_trainer_recipe_has_an_estimate(
        self, tailoring: dict[int, dict], enchanting: dict[int, dict], alchemy: dict[int, dict]
    ) -> None:
        skills = json.loads((CRAFTING_DATA / "classic" / "trainerSkills.json").read_text(encoding="utf-8"))
        for name, recipes in (("tailoring", tailoring), ("enchanting", enchanting), ("alchemy", alchemy)):
            for spell, entry in skills[name].items():
                recipe = recipes[int(spell)]
                assert recipe["learn"]["source"] == "trainer"
                assert 1 <= entry["forever"] <= recipe["yellow"]

    def test_every_first_aid_trainer_recipe_has_an_estimate(self, first_aid: dict[int, dict]) -> None:
        skills = json.loads((CRAFTING_DATA / "classic" / "trainerSkills.json").read_text(encoding="utf-8"))
        for spell, entry in skills["firstaid"].items():
            assert first_aid[int(spell)]["learn"]["source"] == "trainer"
            assert 1 <= entry["forever"] <= first_aid[int(spell)]["yellow"]

    def test_classic_teachers_replace_the_trainer(self, tailoring: dict[int, dict]) -> None:
        assert tailoring[26086]["learn"] == {"source": "npc", "npcs": ["Journal of Jandice Barov"], "classic": "npc"}
        assert tailoring[19435]["learn"]["quests"] == [{"id": 6032, "title": "Sacred Cloth"}]
        robe = tailoring[7636]["learn"]
        assert (robe["source"], robe["itemId"], robe["skill"], robe["estimated"]) == ("item", 6273, 65, True)

    def test_every_trainer_recipe_is_a_classic_trainers(self) -> None:
        """A recipe labelled "trainer" that Forever didn't add is one a Classic trainer teaches — or came with Classic's skill."""
        skills = json.loads((CRAFTING_DATA / "classic" / "trainerSkills.json").read_text(encoding="utf-8"))
        for profession, taught in skills.items():
            if profession == "source":
                continue
            for spell, recipe in _recipes(profession).items():
                learn = recipe["learn"]
                if learn["source"] == "trainer" and not recipe.get("newInForever") and learn.get("classic") != "start":
                    assert str(spell) in taught, f"{profession} {spell} {recipe['name']}"

    def test_cmangos_license_kept(self) -> None:
        assert (CRAFTING_DATA / "classic" / "LICENSE").is_file()
        assert "cmangos" in (CRAFTING_DATA / "classic" / "README.md").read_text(encoding="utf-8")


class TestCommittedFirstAid:
    def test_bandages_keep_their_classic_colours(self, first_aid: dict[int, dict]) -> None:
        assert (first_aid[LINEN_BANDAGE]["yellow"], first_aid[LINEN_BANDAGE]["grey"]) == (30, 60)
        assert first_aid[LINEN_BANDAGE]["learn"]["source"] == "start"
        assert (first_aid[HEAVY_RUNECLOTH_BANDAGE]["yellow"], first_aid[HEAVY_RUNECLOTH_BANDAGE]["grey"]) == (290, 350)

    def test_manuals_teach_through_the_child_skill_line(self, first_aid: dict[int, dict]) -> None:
        learn = first_aid[HEAVY_SILK_BANDAGE]["learn"]
        assert learn == {"source": "item", "skill": 180, "itemId": 16112, "item": "Manual: Heavy Silk Bandage", "classic": "item"}

    def test_healing_potions_moved_from_alchemy(self, first_aid: dict[int, dict], alchemy: dict[int, dict]) -> None:
        potion = first_aid[HEALING_POTION_SPELL]
        assert potion["creates"]["id"] == HEALING_POTION_ITEM and potion["newInForever"] is True
        assert all(r["creates"]["id"] != HEALING_POTION_ITEM for r in alchemy.values())

    def test_child_skill_lines_are_added(self) -> None:
        rows = [{"ID": "2942", "ParentSkillLineID": "129"}, {"ID": "2948", "ParentSkillLineID": "197"}, {"ID": "7", "ParentSkillLineID": "0"}]
        assert with_child_skill_lines({129}, rows) == {129, 2942}


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


class TestGatherNodes:
    def test_skill_locks_become_herbalism_or_mining(self, monkeypatch: pytest.MonkeyPatch) -> None:
        locks = [
            {"ID": "29", "Type_0": "2", "_Index_0": "2", "Skill_0": "1"},  # Silverleaf
            {"ID": "39", "Type_0": "2", "_Index_0": "3", "Skill_0": "65"},  # Tin Vein
            {"ID": "57", "Type_0": "2", "_Index_0": "1", "Skill_0": "1"},  # a lockbox: lockpicking
        ]
        monkeypatch.setattr(recipe_sources.sources, "wago_table", lambda name: locks)
        assert _gather_locks({1617: 29, 1732: 39, 3714: 57, 9: 0}) == {1617: ("herbalism", 1), 1732: ("mining", 65)}

    def test_committed_herb_spots_say_herbalism(self) -> None:
        reagents = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))["reagents"]
        peacebloom = reagents["2447"]["objectSpots"]
        assert peacebloom and all(spot[6:] == ["herbalism", 1] for spot in peacebloom)
        goldthorn = reagents["3821"]["objectSpots"][0]
        assert goldthorn[6] == "herbalism" and goldthorn[7] > 100


class TestVendorStock:
    def test_stock_and_restock_from_maxcount_and_incrtime(self) -> None:
        assert _stock({"maxcount": 2, "incrtime": 7200}) == (2, 120)
        assert _stock({"maxcount": 0, "incrtime": 0}) == (0, 0)

    def test_committed_enchanting_supplier_stock(self) -> None:
        data = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))
        assert data["vendorColumns"] == VENDOR_COLUMNS
        tilli = [v for v in data["reagents"]["10938"]["vendors"] if v[1] == "Tilli Thistlefuzz"]
        assert tilli and tilli[0][-2:] == [2, 120]  # Lesser Magic Essence: 2 at a time, every 2 hours

    def test_every_sold_recipe_has_a_price(self) -> None:
        recipes = json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))["recipes"]
        sold = {k: v for k, v in recipes.items() if v.get("vendors")}
        assert len(sold) > 100
        assert all(v.get("price", 0) > 0 for v in sold.values())
        assert not any("price" in v for k, v in recipes.items() if k not in sold)


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

    def test_mobs_say_why_they_are_no_farm(self, sources: dict) -> None:
        kinds = {m[0]: m[8] for m in sources["reagents"]["3182"]["drop"]["mobs"]}
        assert kinds["Creepthess"] == "rare" and kinds["Plains Creeper"] == ""
        cloth = sources["reagents"]["2592"]["drop"]["mobs"]
        assert all(m[8] == "" for m in cloth)  # cloth farm spots are packs, never a rare

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


def _smelt(spell: int, ore: int, bar: int, yellow: int, source: str = "trainer", extra: tuple[int, ...] = ()) -> dict:
    return {
        "spell": spell, "name": f"Smelt {bar}", "yellow": yellow, "grey": yellow + 40,
        "reagents": [{"id": i, "name": "", "count": 1} for i in (ore, *extra)],
        "creates": {"id": bar, "name": "", "count": 1, "quality": 1},
        "learn": {"source": source, "skill": 1} if source == "start" else {"source": source},
    }


COPPER_ORE, TIN_ORE, COPPER_BAR, TIN_BAR, BRONZE_BAR, IRON_BAR = 2770, 2771, 2840, 3576, 2841, 3575


class TestSmeltingFor:
    MINING = [
        _smelt(2657, COPPER_ORE, COPPER_BAR, 25, source="start"),
        _smelt(3304, TIN_ORE, TIN_BAR, 65),
        _smelt(2659, COPPER_BAR, BRONZE_BAR, 65, extra=(TIN_BAR,)),
        _smelt(3307, 2772, IRON_BAR, 130),
    ]

    def test_only_the_bars_used_and_the_bars_they_need(self) -> None:
        belt = {"reagents": [{"id": BRONZE_BAR, "count": 2}]}
        smelts = smelting_for([belt], self.MINING, {3304: 50, 2659: 65})
        assert [s["spell"] for s in smelts] == [2657, 3304, 2659]
        assert [s["skill"] for s in smelts] == [1, 50, 65]

    def test_no_classic_trainer_skill_falls_back_to_yellow(self) -> None:
        smelts = smelting_for([{"reagents": [{"id": IRON_BAR, "count": 1}]}], self.MINING, {})
        assert [(s["spell"], s["skill"]) for s in smelts] == [(3307, 130)]


class TestMiningRecords:
    CAMP = {**_smelt(1230161, 2835, 279960, 20), "name": "Lodestone"}
    TRACKING = {"spell": 2580, "name": "Find Minerals", "yellow": 0, "grey": 0, "reagents": [], "learn": {"source": "start", "skill": 1}}

    def test_splits_forge_smelts_from_camp_items_and_drops_what_makes_nothing(self) -> None:
        mining = [*TestSmeltingFor.MINING, self.CAMP, self.TRACKING]
        focus = {2657: "Forge", 3304: "Forge", 2659: "Forge", 3307: "Black Forge"}
        out = mining_records(mining, {3304: 50, 2659: 65}, focus)
        assert [(s["spell"], s["skill"], s["focus"]) for s in out["smelting"]] == [
            (2657, 1, "Forge"), (3304, 50, "Forge"), (2659, 65, "Forge"), (3307, 130, "Black Forge"),
        ]
        assert [(c["name"], c["skill"]) for c in out["camp"]] == [("Lodestone", 20)]
        assert "focus" not in out["camp"][0]


@pytest.fixture(scope="module")
def mining_file() -> dict:
    return json.loads((CRAFTING_DATA / "mining.json").read_text(encoding="utf-8"))


class TestCommittedMining:
    """Forever client facts the Mining guide states (1.60.1.70790)."""

    def test_every_smelt_has_its_forge(self, mining_file: dict) -> None:
        by_name = {s["name"]: s for s in mining_file["smelting"]}
        assert by_name["Smelt Copper"]["skill"] == 1 and by_name["Smelt Copper"]["focus"] == "Forge"
        assert by_name["Smelt Dark Iron"]["focus"] == "Black Forge"
        assert by_name["Smelt Heavy Thorium"]["focus"] == "Molten Foundry"
        assert by_name["Smelt Heavy Thorium"]["yellow"] == 300
        azerothium = by_name["Smelt Azerothium"]
        assert azerothium["yellow"] == 275 and azerothium["focus"] == "Forge"
        assert sorted((r["name"], r["count"]) for r in azerothium["reagents"]) == [("Coal", 1), ("Pitchblende", 2)]

    def test_camp_items(self, mining_file: dict) -> None:
        assert [(c["name"], c["yellow"]) for c in mining_file["camp"]] == [("Lodestone", 20), ("Rock Garden", 140), ("Molten Foundry", 300)]


class TestSpecializations:
    """Classic trainers and quests, faked: 9788 is Armorsmith, 9787 Weaponsmith.

    NPC 1 gives the Armorsmith quest, 2 the Weaponsmith one, 3 gives none but
    teaches only what 1 does (Orgrimmar's second trainer), 4 is a plain trainer
    (it teaches recipes no specialist does). 2661 is a recipe everyone teaches.
    """

    @pytest.fixture(autouse=True)
    def fake_sources(self, monkeypatch: pytest.MonkeyPatch) -> None:
        effects = [
            {"SpellID": "100", "Effect": "36", "EffectTriggerSpell": "9788"},  # quest reward teaches Armorsmith
            {"SpellID": "201", "Effect": "36", "EffectTriggerSpell": "9974"},  # trainer spell -> recipe
        ]
        dump = {
            "quest_template": [
                {"entry": 5283, "RewSpell": 100, "RewSpellCast": 0, "RequiredSkillValue": 200, "MinLevel": 40,
                 "ReqItemId1": 7937, "ReqItemCount1": 4, "ReqItemId2": 0, "ReqItemCount2": 0,
                 "ReqItemId3": 0, "ReqItemCount3": 0, "ReqItemId4": 0, "ReqItemCount4": 0},
                {"entry": 5284, "RewSpell": 9787, "RewSpellCast": 0, "RequiredSkillValue": 200, "MinLevel": 40,
                 "ReqItemId1": 0, "ReqItemCount1": 0, "ReqItemId2": 0, "ReqItemCount2": 0,
                 "ReqItemId3": 0, "ReqItemCount3": 0, "ReqItemId4": 0, "ReqItemCount4": 0},
                {"entry": 1, "RewSpell": 2575, "RewSpellCast": 0},
            ],
            "creature_questrelation": [{"id": 1, "quest": 5283}, {"id": 2, "quest": 5284}],
            "npc_trainer": [
                {"entry": 1, "spell": 201, "reqskill": 164},
                {"entry": 3, "spell": 201, "reqskill": 164},
                {"entry": 2, "spell": 10011, "reqskill": 164},
                {"entry": 1, "spell": 2661, "reqskill": 164},
                {"entry": 4, "spell": 2661, "reqskill": 164},
                {"entry": 2, "spell": 2661, "reqskill": 164},
                {"entry": 4, "spell": 2662, "reqskill": 164},
                {"entry": 4, "spell": 2108, "reqskill": 165},
            ],
            "npc_trainer_template": [],
            "creature_template": [],
        }
        monkeypatch.setattr(specs, "wago_table", lambda name, **_: effects if name == "SpellEffect" else [])
        monkeypatch.setattr(specs, "cmangos_dump", lambda: Path("unused"))
        monkeypatch.setattr(specs, "read_dump", lambda _path, wanted: {k: dump[k] for k in wanted})

    def test_quests_reward_the_specialization_or_the_spell_that_teaches_it(self) -> None:
        quests = specs.spec_quests(164)
        assert [(q.quest, q.spec, q.skill, q.level, q.items, q.givers) for q in quests] == [
            (5283, 9788, 200, 40, [(7937, 4)], [1]),
            (5284, 9787, 200, 40, [], [2]),
        ]

    def test_recipes_only_specialists_teach(self) -> None:
        # 9974 is taught by 1 and by 3 (no quest, teaches only Armorsmith things);
        # 2661 is taught by both specialists and the plain trainer, so it needs no specialization.
        assert specs.trainer_specs(164, specs.spec_quests(164)) == {9974: 9788, 10011: 9787}


@pytest.fixture(scope="module")
def blacksmithing_file() -> dict:
    return json.loads((CRAFTING_DATA / "blacksmithing.json").read_text(encoding="utf-8"))


TRUESILVER_BREASTPLATE, DAWNS_EDGE, COPPER_CHAIN_BELT = 9974, 16970, 2661
ARMORSMITH, MASTER_AXESMITH = 9788, 17041


class TestCommittedBlacksmithing:
    def test_specialist_recipes(self, blacksmithing_file: dict) -> None:
        recipes = {r["spell"]: r for r in blacksmithing_file["recipes"]}
        assert recipes[TRUESILVER_BREASTPLATE]["spec"] == ARMORSMITH
        assert recipes[DAWNS_EDGE]["spec"] == MASTER_AXESMITH
        assert "spec" not in recipes[COPPER_CHAIN_BELT]

    def test_specializations_with_their_classic_quests(self, blacksmithing_file: dict) -> None:
        by_spell = {s["spell"]: s for s in blacksmithing_file["specs"]}
        assert set(by_spell) == set(specs.SPECIALIZATIONS[164])
        armorsmith = by_spell[ARMORSMITH]
        assert armorsmith["name"] == "Armorsmith"
        assert {q["id"] for q in armorsmith["quests"]} == {5283, 5301}
        assert all(q["skill"] == 200 and q["level"] == 40 for q in armorsmith["quests"])

    def test_smelting_covers_every_bar_starting_with_copper(self, blacksmithing_file: dict) -> None:
        smelting = blacksmithing_file["smelting"]
        assert smelting[0]["creates"]["id"] == COPPER_BAR and smelting[0]["skill"] == 1
        made = {s["creates"]["id"] for s in smelting}
        assert {COPPER_BAR, BRONZE_BAR, IRON_BAR} <= made


@pytest.fixture(scope="module")
def leatherworking_file() -> dict:
    return json.loads((CRAFTING_DATA / "leatherworking.json").read_text(encoding="utf-8"))


DRAGONSCALE_BREASTPLATE, HELM_OF_FIRE, CHIMERIC_GLOVES, LIGHT_ARMOR_KIT = 10650, 10632, 19053, 2152
DRAGONSCALE, ELEMENTAL, TRIBAL = 10656, 10658, 10660
LIGHT_LEATHER, DEVILSAUR_LEATHER = "2318", "15417"


class TestCommittedLeatherworking:
    def test_specialist_recipes(self, leatherworking_file: dict) -> None:
        recipes = {r["spell"]: r for r in leatherworking_file["recipes"]}
        assert recipes[DRAGONSCALE_BREASTPLATE]["spec"] == DRAGONSCALE
        assert recipes[HELM_OF_FIRE]["spec"] == ELEMENTAL
        assert recipes[CHIMERIC_GLOVES]["spec"] == TRIBAL
        assert "spec" not in recipes[LIGHT_ARMOR_KIT]

    def test_specializations_with_their_classic_quests(self, leatherworking_file: dict) -> None:
        by_spell = {s["spell"]: s for s in leatherworking_file["specs"]}
        assert set(by_spell) == {DRAGONSCALE, ELEMENTAL, TRIBAL}
        assert {q["id"] for q in by_spell[TRIBAL]["quests"]} == {5143, 5148}
        assert all(q["skill"] == 225 and q["level"] == 40 for s in by_spell.values() for q in s["quests"])

    def test_no_smelting(self, leatherworking_file: dict) -> None:
        assert "smelting" not in leatherworking_file


class TestSkinningSpots:
    @pytest.fixture(scope="class")
    def sources(self) -> dict:
        return json.loads((CRAFTING_DATA / "classic" / "sources.json").read_text(encoding="utf-8"))

    def test_a_beast_to_skin_per_zone_on_both_sides(self, sources: dict) -> None:
        mobs = sources["reagents"][LIGHT_LEATHER]["skinning"]["mobs"]
        zones = [m[4] for m in mobs]
        assert len(zones) >= 5 and len(set(zones)) == len(zones)
        assert all(m[5] and 0 < m[6] < 100 and 0 < m[7] < 100 for m in mobs)  # a subzone and coordinates
        assert {sources["territory"][str(z)] for z in zones} >= {"alliance", "horde"}

    def test_falls_back_to_the_beasts_when_no_pack_is_dense_enough(self, sources: dict) -> None:
        mobs = sources["reagents"][DEVILSAUR_LEATHER]["skinning"]["mobs"]
        assert mobs and all("Devilsaur" in m[0] and m[8] == "elite" for m in mobs)

    def test_no_count_left_in_the_output(self, sources: dict) -> None:
        assert all("count" not in r["skinning"] for r in sources["reagents"].values() if r.get("skinning"))
