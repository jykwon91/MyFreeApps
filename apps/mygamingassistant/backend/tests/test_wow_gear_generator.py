"""WoW Forever "Best gear" generator — sources, filters, raid gating, and sanity
checks on the committed data it produced.

Known cases are from the data: Talisman of Binding Shard is flagged deprecated
in the Forever client; Plagueheart needs Naxxramas tokens; the Signet Rings of
the Bronze Dragonflight need Brood of Nozdormu reputation (Ahn'Qiraj); the
Warsong Gulch quartermasters sell Advisor's Ring only at Honored.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scripts.wow_gear.build import (
    classic_pvp_items,
    condition_factions,
    crafted_items,
    dungeon_levels,
    era_leftovers,
    item_facts,
    quest_rewards,
)
from scripts.wow_gear.loot import (
    INSTANCE_DUNGEON,
    INSTANCE_RAID,
    RANK_BOSS,
    RANK_ELITE,
    boss_drops,
    creature_items_by_place,
    creature_maps,
    loot_index,
    table_items,
)
from scripts.wow_gear.raid_gate import raid_gated_quests, raid_given_quests

GEAR_DATA = Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "gear"

DEADMINES = 36
NAXXRAMAS = 533
KALIMDOR = 1
INSTANCE_TYPES = {DEADMINES: INSTANCE_DUNGEON, NAXXRAMAS: INSTANCE_RAID, KALIMDOR: 0}


def _quest(entry: int, **fields: Any) -> dict[str, Any]:
    return {"entry": entry, "Title": f"Quest {entry}", "MinLevel": 10, "QuestLevel": 12, "RequiredRaces": 0,
            "RequiredClasses": 0, "PrevQuestId": 0, "NextQuestId": 0, **fields}


def _loot(entry: int, item: int, *, ref: int = 0, chance: float = 10.0) -> dict[str, Any]:
    return {"entry": entry, "item": item, "mincountOrRef": ref, "ChanceOrQuestChance": chance}


def _creature(entry: int, name: str, loot_id: int, rank: int = RANK_ELITE) -> dict[str, Any]:
    return {"Entry": entry, "Name": name, "LootId": loot_id, "Rank": rank}


class TestCraftedItems:
    def test_lowest_skill_wins(self) -> None:
        docs = {
            "tailoring": {"recipes": [
                {"creates": {"id": 14153}, "learn": {"skill": 300}},
                {"creates": {"id": 14153}, "learn": {"skill": 275}},
            ]},
            "enchanting": {"recipes": [{"creates": None}, {"creates": {"id": 11288}, "yellow": 70}]},
        }
        assert crafted_items(docs) == {14153: ["Tailoring", 275], 11288: ["Enchanting", 70]}


class TestItemFacts:
    def test_flags_requirements_and_pvp(self) -> None:
        rows = [
            {"ID": 1, "RequiredSkill": 202, "RequiredSkillRank": 245, "Bonding": 1},
            {"ID": 2, "MinFactionID": 529, "MinReputation": 5},
            {"ID": 3, "RequiredPVPRank": 7},
            {"ID": 4, "MinFactionID": 729, "MinReputation": 5},
            {"ID": 5, "Display_lang": "Premier Warlord's Felweave Hood"},
            {"ID": 6, "Flags_0": 0x10},
            {"ID": 7, "Flags_0": 0x8000},
            {"ID": 99, "RequiredPVPRank": 7},
        ]
        facts = item_facts(rows, {1, 2, 3, 4, 5, 6, 7}, {202: "Engineering"}, {529: "Argent Dawn", 729: "Frostwolf Clan"})
        assert facts["requires"] == {1: ["Engineering", 245]}
        assert facts["reputation"] == {2: ["Argent Dawn", "Honored"], 4: ["Frostwolf Clan", "Honored"]}
        assert facts["pvp"] == {3: 1, 4: 1, 5: 1}
        assert facts["bindOnPickup"] == {1: 1}
        assert facts["deprecated"] == [6]


class TestClassicPvp:
    CONDITIONS = {
        1529: {"condition_entry": 1529, "type": 5, "value1": 889, "value2": 5, "value3": 0, "value4": 0},
        1530: {"condition_entry": 1530, "type": 5, "value1": 890, "value2": 5, "value3": 0, "value4": 0},
        1536: {"condition_entry": 1536, "type": -2, "value1": 1529, "value2": 1530, "value3": 0, "value4": 0},
        2000: {"condition_entry": 2000, "type": 5, "value1": 529, "value2": 4, "value3": 0, "value4": 0},
    }

    def test_condition_or_group(self) -> None:
        assert condition_factions(self.CONDITIONS, 1536) == {889, 890}
        assert condition_factions(self.CONDITIONS, 0) == set()

    def test_item_rank_reputation_and_vendor(self) -> None:
        items = [
            {"entry": 19090, "RequiredReputationFaction": 729},
            {"entry": 16341, "requiredhonorrank": 7},
            {"entry": 22657, "RequiredReputationFaction": 529},
        ]
        vendors = [{"item": 19518, "condition_id": 1536}, {"item": 22656, "condition_id": 2000}, {"item": 1, "condition_id": 0}]
        gear = {19090, 16341, 22657, 19518, 22656, 1}
        assert classic_pvp_items(items, vendors, self.CONDITIONS, gear) == [16341, 19090, 19518]


def test_era_leftovers_only_new_ids_the_era_client_has() -> None:
    assert era_leftovers({50, 100001, 100002}, {50, 100002}) == [100002]


class TestQuestRewards:
    def test_listed_sided_and_skipped(self) -> None:
        rows = [
            _quest(1, RewChoiceItemId1=500, RequiredRaces=1),
            _quest(2, RewItemId1=500, MinLevel=8, QuestLevel=-1, RequiredClasses=256),
            _quest(3, RewItemId1=500),
            _quest(4, RewItemId1=500),
        ]
        out = quest_rewards(rows, listed_quests={1, 2, 4}, gear_ids={500}, skip={4})
        assert out == {500: [["Quest 2", 8, 8, "N", "warlock"], ["Quest 1", 10, 12, "A", ""]]}


class TestRaidGatedQuests:
    def test_direct_chain_next_and_reward_propagation(self) -> None:
        quests = [
            _quest(10, ReqItemId1=900, RewItemId1=901),  # needs a raid token
            _quest(11, PrevQuestId=10),                    # follows a gated quest
            _quest(12, NextQuestId=13),                    # not gated itself
            _quest(13),
            _quest(14, ReqItemId1=901),                    # needs a reward only gated quests give
            _quest(20, RewItemId1=950, NextQuestId=21),
            _quest(21),
        ]
        gated = raid_gated_quests(quests, start_items={20: 900}, raid_items={900}, elsewhere=set(), raid_given=set())
        assert gated == {10, 11, 14, 20, 21}

    def test_items_found_elsewhere_dont_propagate(self) -> None:
        quests = [_quest(10, ReqItemId1=900, RewItemId1=901), _quest(14, ReqItemId1=901)]
        gated = raid_gated_quests(quests, start_items={}, raid_items={900}, elsewhere={901}, raid_given=set())
        assert gated == {10}

    def test_raid_reputation_and_raid_givers(self) -> None:
        quests = [
            _quest(8757, RequiredMinRepFaction=910, RequiredMinRepValue=0),
            _quest(8106, RequiredMinRepFaction=270, RequiredMinRepValue=3000),
            _quest(7000, RequiredMinRepFaction=529, RequiredMinRepValue=3000),
            _quest(9000),
        ]
        gated = raid_gated_quests(quests, start_items={}, raid_items=set(), elsewhere=set(), raid_given={9000})
        assert gated == {8757, 8106, 9000}

    def test_raid_given_needs_every_giver_in_a_raid(self) -> None:
        templates = [_creature(1, "Raid NPC", 0), _creature(2, "Town NPC", 0)]
        maps = {1: {NAXXRAMAS}, 2: {KALIMDOR}}
        relations = [{"id": 1, "quest": 50}, {"id": 1, "quest": 51}, {"id": 2, "quest": 51}]
        given = raid_given_quests(relations, templates, lambda t: maps[t["Entry"]], INSTANCE_TYPES)
        assert given == {50}


class TestLoot:
    def test_table_items_follows_references_and_keeps_quest_drops(self) -> None:
        index = loot_index([_loot(1, 100), _loot(1, 0, ref=-7), _loot(2, 300, chance=-50)])
        references = loot_index([_loot(7, 200)])
        assert table_items(index, references, [1, 2]) == {100, 200, 300}

    def test_creature_maps_falls_back_to_encounter(self) -> None:
        maps_of = creature_maps([{"id": 1, "map": DEADMINES}], {469: {"Nefarian"}})
        assert maps_of(_creature(1, "Cookie", 0)) == {DEADMINES}
        assert maps_of(_creature(2, "Nefarian", 0)) == {469}

    def test_items_by_place(self) -> None:
        templates = [_creature(1, "Raid trash", 10), _creature(2, "Dungeon mob", 20), _creature(3, "Nowhere", 30)]
        maps = {1: {NAXXRAMAS}, 2: {DEADMINES}, 3: set()}
        loot = loot_index([_loot(10, 900), _loot(10, 5), _loot(20, 5), _loot(30, 7)])
        raid, other = creature_items_by_place(templates, lambda t: maps[t["Entry"]], loot, {}, INSTANCE_TYPES)
        assert raid == {900, 5}
        assert other == {5}

    def test_boss_drops(self) -> None:
        templates = [
            _creature(1, "Edwin VanCleef", 10, RANK_BOSS),
            _creature(2, "Cookie", 20, RANK_ELITE),
            _creature(3, "Kel'Thuzad", 30, RANK_BOSS),
            _creature(4, "Defias Pirate", 40, RANK_ELITE),
            _creature(5, "Azuregos", 50, RANK_BOSS),
        ]
        maps = {1: {DEADMINES}, 2: {DEADMINES}, 3: {NAXXRAMAS}, 4: {DEADMINES}, 5: {KALIMDOR}}
        loot = loot_index([
            _loot(10, 101), _loot(10, 0, ref=-500),
            _loot(20, 102),
            _loot(30, 103), _loot(30, 101),
            _loot(40, 104), _loot(40, 0, ref=-600),
            _loot(50, 105),
            _loot(60, 0, ref=-600),  # pool 600 is shared, so it's a world drop
        ])
        references = loot_index([_loot(500, 106), _loot(600, 107)])
        encounters = {DEADMINES: {"Edwin VanCleef", "Cookie"}}
        drops, raid = boss_drops(
            templates, lambda t: maps[t["Entry"]], loot, references, INSTANCE_TYPES, encounters, {101, 102, 103, 104, 105, 106, 107},
        )
        assert drops == {101: [["Edwin VanCleef", DEADMINES]], 102: [["Cookie", DEADMINES]], 106: [["Edwin VanCleef", DEADMINES]]}
        assert raid == {103, 105}


DUNGEON_COLUMNS = ["instance", "name", "type", "maxLevel", "requiredLevel"]


def test_dungeon_levels_one_entry_per_instance() -> None:
    doc = {
        "columns": DUNGEON_COLUMNS,
        "rows": [
            [DEADMINES, "The Deadmines", "dungeon", 24, 10],
            [DEADMINES, "The Deadmines", "dungeon", 24, 10],  # a second entrance / wing
            [NAXXRAMAS, "Naxxramas", "raid", 60, 60],
        ],
    }
    assert dungeon_levels(doc) == {DEADMINES: ["The Deadmines", 24, 10]}


def test_dungeon_levels_fails_when_wings_differ() -> None:
    doc = {
        "columns": DUNGEON_COLUMNS,
        "rows": [[DEADMINES, "The Deadmines", "dungeon", 24, 10], [DEADMINES, "The Deadmines", "dungeon", 26, 12]],
    }
    with pytest.raises(SystemExit, match="different levels"):
        dungeon_levels(doc)


@pytest.fixture(scope="module")
def facts() -> dict[str, Any]:
    return json.loads((GEAR_DATA / "gearFacts.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def sources() -> dict[str, Any]:
    return json.loads((GEAR_DATA / "classic" / "gearSources.json").read_text(encoding="utf-8"))


class TestCommittedOutput:
    def test_no_encounter_journal_in_the_client(self, facts: dict[str, Any]) -> None:
        assert facts["encounterJournal"] is False

    def test_deprecated_items(self, facts: dict[str, Any]) -> None:
        assert {17782, 5000}.issubset(facts["deprecated"])  # Talisman of Binding Shard, Coral Band

    def test_raid_only_items(self, sources: dict[str, Any]) -> None:
        raid_only = set(sources["raidOnly"])
        assert {21196, 21197, 21198}.issubset(raid_only)  # Signet Rings of the Bronze Dragonflight (Brood of Nozdormu)
        assert {19602, 19603, 19604}.issubset(raid_only)  # Kezan's Taint (Zandalar Tribe)
        assert {22504, 22505, 22506}.issubset(raid_only)  # Plagueheart (Naxxramas tokens)
        assert not raid_only & set(map(int, sources["quests"]))

    def test_warsong_rewards_are_pvp(self, sources: dict[str, Any]) -> None:
        assert {19518, 19522, 19090}.issubset(sources["pvp"])

    def test_forever_premier_gear_is_pvp(self, facts: dict[str, Any]) -> None:
        # Premier Magus Footwraps (set "Champion's Regalia"), Premier Satin Cowl
        # ("Champion's Raiment"), Premier Field Marshal's Mooncloth Headdress
        # ("Field Marshal's Investiture") — PvP rank sets in the client's ItemSet.
        pvp = {int(k) for k in facts["pvp"]}
        assert {272453, 272562, 273421}.issubset(pvp)

    def test_classic_license_is_kept(self) -> None:
        assert (GEAR_DATA / "classic" / "LICENSE").is_file()
        assert "cmangos" in (GEAR_DATA / "classic" / "README.md").read_text(encoding="utf-8")
