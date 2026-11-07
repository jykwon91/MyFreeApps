"""Tests for the WoW Forever item pages generator (``scripts/wow_item_pages``).

Pure functions over small hand-made rows, then sanity checks on the committed
shards. No network.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from scripts.wow_item_pages.build import CLASSIC_DIR, PAGES_DIR, UNSEEN_PATH, unseen_gear
from scripts.wow_item_pages.drops import (
    KIND_BOSS,
    KIND_RARE,
    chance_band,
    instance_drops,
    instance_kind,
    level_range,
    world_mobs,
)
from scripts.wow_item_pages.facts import crafted_by, item_facts
from scripts.wow_item_pages.finder import instance_rows, quest_rows
from scripts.wow_item_pages.loot_chances import (
    drop_index,
    loot_index,
    pool_items,
    pool_users,
    table_chances,
    world_pools,
)
from scripts.wow_item_pages.shards import SHARD_COUNT, classic_shard, forever_shard, shard_of, source_zones, split

FRONTEND_CONFIG = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "itemPages" / "itemPageConfig.ts"
)


def _loot(entry: int, item: int, chance: float, group: int = 0, ref: int = 1, maxcount: int = 1) -> dict[str, Any]:
    return {"entry": entry, "item": item, "ChanceOrQuestChance": chance, "groupid": group, "mincountOrRef": ref, "maxcount": maxcount}


# --- loot chances -----------------------------------------------------------------------------------------


def test_ungrouped_row_keeps_its_chance_and_quest_drops_are_skipped() -> None:
    chances = table_chances([_loot(1, 100, 25.0), _loot(1, 101, -50.0)], {})
    assert chances == {100: pytest.approx(0.25)}


def test_equal_chance_group_rows_split_what_is_left() -> None:
    # Hand of Justice shape: one explicit row at 10%, three zero rows share the other 90%.
    rows = [_loot(1, 200, 10.0, group=1), _loot(1, 201, 0, group=1), _loot(1, 202, 0, group=1), _loot(1, 203, 0, group=1)]
    chances = table_chances(rows, {})
    assert chances[200] == pytest.approx(0.10)
    assert chances[201] == pytest.approx(0.30)
    assert chances[203] == pytest.approx(0.30)


def test_reference_rolled_maxcount_times() -> None:
    references = {50: [_loot(50, 300, 50.0)]}
    chances = table_chances([_loot(1, 0, 100.0, ref=-50, maxcount=2)], references)
    # Two rolls at 50% each: 1 - 0.5².
    assert chances[300] == pytest.approx(0.75)


def test_two_rows_for_the_same_item_combine_as_either() -> None:
    chances = table_chances([_loot(1, 400, 50.0), _loot(1, 400, 50.0)], {})
    assert chances[400] == pytest.approx(0.75)


def test_a_reference_many_creatures_share_is_a_world_pool_and_left_out_of_their_own_loot() -> None:
    creature_loot = loot_index([_loot(npc, 0, 100.0, ref=-90) for npc in range(1, 11)] + [_loot(11, 500, 5.0)])
    references = loot_index([_loot(90, 600, 1.0)])
    pools = world_pools(creature_loot)
    assert pools == {90}
    index = drop_index(creature_loot, references, pools, {500, 600})
    assert index[500] == {11: 5.0}
    assert 600 not in index
    assert pool_items(references, pools, {600}) == {600: {90}}
    assert pool_users(creature_loot, pools)[90] == set(range(1, 11))


# --- drops ------------------------------------------------------------------------------------------------


def test_chance_bands() -> None:
    assert [chance_band(c) for c in (40.0, 15.0, 6.0, 0.4)] == [0, 0, 1, 2]


def test_instance_kind_boss_by_rank_or_encounter_name_rare_by_rank() -> None:
    assert instance_kind({"Rank": 3, "Name": "X"}, set()) == KIND_BOSS
    assert instance_kind({"Rank": 1, "Name": "Mr. Smite"}, {"Mr. Smite"}) == KIND_BOSS
    assert instance_kind({"Rank": 2, "Name": "Y"}, set()) == KIND_RARE
    assert instance_kind({"Rank": 0, "Name": "Z"}, set()) == ""


def _template(name: str, rank: int = 0, lo: int = 20, hi: int = 21) -> dict[str, Any]:
    return {"Name": name, "Rank": rank, "MinLevel": lo, "MaxLevel": hi}


def test_instance_drops_list_bosses_first_within_a_band_and_drop_open_world_mobs() -> None:
    templates = {1: _template("Boss", rank=3), 2: _template("Trash"), 3: _template("Outside"), 4: _template("Tiny trash")}
    maps = {1: {36}, 2: {36}, 3: {0}, 4: {36}}
    result = instance_drops({1: 18.0, 2: 20.0, 3: 30.0, 4: 0.2}, templates, lambda t: maps[next(k for k, v in templates.items() if v is t)], {36: 1, 0: 0}, {})
    assert result is not None
    assert [m[0] for m in result["mobs"]] == ["Boss", "Trash"]
    assert result["mobs"][0] == ["Boss", 20, 21, 18.0, 36, KIND_BOSS]
    assert result["more"] == 0


def test_instance_drops_none_when_no_mob_is_inside() -> None:
    assert instance_drops({1: 5.0}, {1: _template("A")}, lambda _t: {0}, {0: 0}, {}) is None


def test_world_mobs_rank_by_band_then_chance_and_keep_the_best_when_all_are_rare() -> None:
    names = {1: "A", 2: "B", 3: "C"}
    assert world_mobs({1: 2.0, 2: 20.0, 3: 6.0}, names) == [2, 3, 1]
    assert world_mobs({1: 0.1, 2: 0.3}, names) == [2]


def test_level_range() -> None:
    assert level_range([_template("a", lo=10, hi=12), _template("b", lo=8, hi=11)]) == [8, 12]
    assert level_range([]) is None


# --- Forever facts ----------------------------------------------------------------------------------------


def test_crafted_by_reads_each_profession_lowest_skill_first() -> None:
    docs = {
        "tailoring": {"recipes": [
            {"spell": 2, "name": "Late", "creates": {"id": 9}, "learn": {"skill": 200, "source": "trainer"}, "reagents": []},
            {"spell": 1, "name": "Early", "creates": {"id": 9}, "yellow": 50, "reagents": [{"id": 2589, "count": 3, "name": "Linen Cloth"}]},
            {"spell": 3, "name": "Other", "creates": {"id": 8}, "reagents": []},
        ]},
        "mining": {"recipes": [{"spell": 4, "name": "No", "reagents": []}]},
    }
    rows = crafted_by(docs, {9})
    assert rows == {9: [
        ["tailoring", 50, 1, "Early", [[2589, 3, "Linen Cloth"]], "", ""],
        ["tailoring", 200, 2, "Late", [], "trainer", ""],
    ]}


def test_item_facts_drop_zeros() -> None:
    sparse = [{"ID": 1, "Bonding": 1, "BuyPrice": 500}, {"ID": 2, "Bonding": 0, "BuyPrice": 0}, {"ID": 3, "Bonding": 2}]
    assert item_facts(sparse, {1, 2}) == {1: {"bind": 1, "buy": 500}, 2: {}}


def test_unseen_gear_is_classic_uncommon_plus_gear_no_forever_table_has() -> None:
    rows = [
        {"entry": 809, "name": "Bloodrazor", "Quality": 3, "class": 2},
        {"entry": 11815, "name": "Hand of Justice", "Quality": 3, "class": 4},
        {"entry": 117, "name": "Tough Jerky", "Quality": 1, "class": 0},
        {"entry": 2000, "name": "Plain Shirt", "Quality": 1, "class": 4},
    ]
    assert unseen_gear(rows, {11815}) == [[809, "Bloodrazor"]]


# --- quests / instances -----------------------------------------------------------------------------------


def test_quest_rows_keep_quests_with_a_placed_giver() -> None:
    doc = {
        "questColumns": ["id", "title", "level", "side", "minLevel", "classes"],
        "giverColumns": ["type", "entry", "name", "zone", "subzone", "x", "y", "faction", "quests"],
        "quests": [[166, "The Defias Brotherhood", 22, "A", 14, ""], [7, "Nobody gives it", 5, "N", 1, ""]],
        "givers": [["npc", 234, "Gryan Stoutmantle", 1436, "Sentinel Hill", 56.3, 47.5, "A", [166]]],
    }
    assert quest_rows(doc, {166, 7}) == {
        166: [166, "The Defias Brotherhood", 22, "A", [["npc", 234, "Gryan Stoutmantle", 1436, "Sentinel Hill", 56.3, 47.5, "A"]], 14, ""],
    }


def test_instance_rows_use_the_entrance_else_the_client_map_name() -> None:
    doc = {
        "columns": ["instance", "name", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "x", "y"],
        "rows": [[230, "Blackrock Depths", "dungeon", 52, 60, 48, 1428, 33.0, 84.0]],
    }
    rows = instance_rows(doc, {249: "Onyxia's Lair"}, {249: 2}, {230, 249})
    assert rows[230] == ["Blackrock Depths", "dungeon", 52, 60, 48, 1428, 33.0, 84.0]
    assert rows[249] == ["Onyxia's Lair", "raid", 0, 0, 0, None, None, None]


# --- shards -----------------------------------------------------------------------------------------------


def test_split_puts_each_id_in_id_mod_count() -> None:
    shards = split([SHARD_COUNT + 1, 1, 2])
    assert len(shards) == SHARD_COUNT
    assert shards[1] == [1, SHARD_COUNT + 1]
    assert shard_of(2) == 2


def test_source_zones_cover_vendors_drops_spots_and_container_drops() -> None:
    record = {
        "vendors": [["V", "", "A", 12, "", 1.0, 2.0, 0, 0]],
        "drop": {"zones": [40], "mobs": [["M", 1, 2, 5.0, 41, "", 1.0, 1.0]]},
        "objectSpots": [["Clam", 3, 42, "", 1.0, 1.0]],
        "containerDrops": [["Small Clam", {"zones": [], "mobs": [["N", 1, 2, 3.0, 43, "", 1.0, 1.0]]}]],
    }
    assert source_zones(record) == {12, 40, 41, 42, 43}


def test_classic_shard_carries_only_what_its_items_name() -> None:
    sources = {1: {"quests": [166]}, 65: {"instance": {"mobs": [["Boss", 59, 59, 19.8, 230, "boss"]], "more": 0}}}
    quests = {166: [166, "Q", 22, "A", [["npc", 1, "G", 1436, "", 1.0, 1.0, "A"]], 14, ""], 999: [999, "X", 1, "N", [], 1, ""]}
    instances = {230: ["Blackrock Depths", "dungeon", 52, 60, 48, 1428, 33.0, 84.0], 36: ["Deadmines", "dungeon", 0, 0, 0, None, None, None]}
    shard = classic_shard(1, [1, 65], sources, quests, instances, {1436: "Westfall", 1428: "Burning Steppes", 1: "Dun Morogh"}, {"1436": "A"})
    assert set(shard["quests"]) == {"166"}
    assert set(shard["instances"]) == {"230"}
    assert shard["zones"] == {"1428": "Burning Steppes", "1436": "Westfall"}
    assert shard["territory"] == {"1436": "A"}
    assert list(shard["items"]) == ["1", "65"]


def test_forever_shard_keeps_rows_and_only_non_empty_facts() -> None:
    shard = forever_shard(0, [64, 128], {64: [64, "A"], 128: [128, "B"]}, {64: {"bind": 1}}, {128: [["tailoring"]]})
    assert shard["items"] == [[64, "A"], [128, "B"]]
    assert shard["facts"] == {"64": {"bind": 1}, "128": {"crafted": [["tailoring"]]}}


# --- committed output -------------------------------------------------------------------------------------


def test_frontend_uses_the_same_shard_count() -> None:
    match = re.search(r"ITEM_PAGE_SHARD_COUNT = (\d+);", FRONTEND_CONFIG.read_text(encoding="utf-8"))
    assert match and int(match.group(1)) == SHARD_COUNT


def test_committed_shards_are_complete_and_each_item_is_in_its_own_shard() -> None:
    forever = sorted(PAGES_DIR.glob("[0-9][0-9].json"))
    classic = sorted(CLASSIC_DIR.glob("[0-9][0-9].json"))
    assert len(forever) == len(classic) == SHARD_COUNT
    for path in forever:
        doc = json.loads(path.read_text(encoding="utf-8"))
        assert doc["shardCount"] == SHARD_COUNT
        assert all(shard_of(row[0]) == doc["shard"] for row in doc["items"])
        assert set(doc["facts"]) <= {str(row[0]) for row in doc["items"]}
    assert (CLASSIC_DIR / "LICENSE").exists() and (CLASSIC_DIR / "README.md").exists()


def test_committed_hand_of_justice_drops_from_thaurissan_in_blackrock_depths() -> None:
    doc = json.loads((CLASSIC_DIR / f"{shard_of(11815):02d}.json").read_text(encoding="utf-8"))
    mobs = doc["items"]["11815"]["instance"]["mobs"]
    boss = next(m for m in mobs if m[0] == "Emperor Dagran Thaurissan")
    assert boss[3] == pytest.approx(19.8, abs=0.1)
    assert doc["instances"][str(boss[4])][0] == "Blackrock Depths"


def test_committed_unseen_items_are_not_in_any_forever_shard() -> None:
    unseen = {row[0] for row in json.loads(UNSEEN_PATH.read_text(encoding="utf-8"))["items"]}
    seen = {row[0] for path in PAGES_DIR.glob("[0-9][0-9].json") for row in json.loads(path.read_text(encoding="utf-8"))["items"]}
    assert unseen and not unseen & seen
