"""Tests for the WoW quest database generator (``scripts/wow_quests/build.py``).

Pure functions over hand-made rows, then checks on the committed output.
No network, no game client.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from scripts.wow_dungeons.build import forever_quest_sides
from scripts.wow_dungeons.quests import (
    QUEST_COLUMNS,
    QuestRow,
    QuestSources,
    chain_before,
    predecessors,
    quest_row,
)
from scripts.wow_quests.build import (
    CLASSIC_DIR,
    INDEX_COLUMNS,
    INDEX_PATH,
    REWARD_ITEM_COLUMNS,
    REWARD_ITEMS_PATH,
    SEEN_PATH,
    SHARD_COUNT,
    _dungeon_ids,
    build_quest_index,
    build_shards,
    quest_zone_map,
)
from scripts.wow_world_map.quests import GIVER_COLUMNS as WORLD_GIVER_COLUMNS


# --- helpers ------------------------------------------------------------------


def _quest(entry: int, title: str = "Q", **fields: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "entry": entry, "Title": title, "QuestLevel": 20, "MinLevel": 17,
        "ZoneOrSort": 0, "RequiredRaces": 0, "RequiredClasses": 0,
        "PrevQuestId": 0, "NextQuestId": 0, "NextQuestInChain": 0,
    }
    for i in range(1, 5):
        row |= {
            f"ReqCreatureOrGOId{i}": 0, f"ReqCreatureOrGOCount{i}": 0,
            f"ReqItemId{i}": 0, f"ReqItemCount{i}": 0,
            f"RewItemId{i}": 0, f"RewItemCount{i}": 0,
        }
    for i in range(1, 7):
        row |= {f"RewChoiceItemId{i}": 0, f"RewChoiceItemCount{i}": 0}
    return row | fields


def _sources(quests: dict[int, dict[str, Any]], **over: Any) -> QuestSources:
    base: dict[str, Any] = {
        "quests": quests,
        "world_givers": {},
        "offered_by": {},
        "ended_by": {},
        "started_by": {},
        "names": {"npc:1": "Stoutmantle"},
        "inside": {},
        "forever_items": {2000},
    }
    return QuestSources(**(base | over))


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


# --- _dungeon_ids -------------------------------------------------------------


def test_dungeon_ids_extracts_only_dungeon_type_entries() -> None:
    doc = {
        "columns": ["instance", "type", "name"],
        "rows": [
            [36, "dungeon", "Deadmines"],
            [30, "raid", "Molten Core"],
            [129, "dungeon", "Razorfen Kraul"],
        ],
    }
    ids = _dungeon_ids(doc)
    assert ids == {36, 129}


def test_dungeon_ids_empty_when_no_dungeons() -> None:
    doc = {"columns": ["instance", "type", "name"], "rows": [[30, "raid", "MC"]]}
    assert _dungeon_ids(doc) == set()


# --- quest_zone_map -----------------------------------------------------------


def test_quest_zone_map_maps_quests_to_their_first_givers_zone() -> None:
    at_zone = WORLD_GIVER_COLUMNS.index("zone")
    at_quests = WORLD_GIVER_COLUMNS.index("quests")

    def row(**kw: Any) -> list[Any]:
        r: list[Any] = [None] * len(WORLD_GIVER_COLUMNS)
        for k, v in kw.items():
            r[WORLD_GIVER_COLUMNS.index(k)] = v
        return r

    world_quests = {
        "givers": [
            row(zone=1436, quests=[166, 167]),
            row(zone=85, quests=[200]),
            row(zone=None, quests=[999]),  # no zone — skip
        ]
    }
    result = quest_zone_map(world_quests)
    assert result[166] == 1436
    assert result[167] == 1436
    assert result[200] == 85
    assert 999 not in result


def test_quest_zone_map_first_giver_wins_for_a_quest_in_multiple_rows() -> None:
    at_zone = WORLD_GIVER_COLUMNS.index("zone")
    at_quests = WORLD_GIVER_COLUMNS.index("quests")

    def row(**kw: Any) -> list[Any]:
        r: list[Any] = [None] * len(WORLD_GIVER_COLUMNS)
        for k, v in kw.items():
            r[WORLD_GIVER_COLUMNS.index(k)] = v
        return r

    world_quests = {"givers": [row(zone=10, quests=[5]), row(zone=20, quests=[5])]}
    result = quest_zone_map(world_quests)
    assert result[5] == 10


def test_quest_zone_map_returns_empty_for_no_givers() -> None:
    assert quest_zone_map({}) == {}
    assert quest_zone_map({"givers": []}) == {}


# --- build_quest_index --------------------------------------------------------


def _make_index(
    forever_ids: set[int],
    src_quests: dict[int, Any] | None = None,
    new_ids: set[int] | None = None,
    keep: dict[int, str] | None = None,
    quest_zone: dict[int, int] | None = None,
    zone_names: dict[int, str] | None = None,
    seen_ids: set[int] | None = None,
) -> dict[str, Any]:
    from scripts.wow_dungeons.quest_cache import QuestCache
    return build_quest_index(
        forever_ids=forever_ids,
        new_ids=new_ids or set(),
        src_quests=src_quests or {},
        keep=keep or {},
        cache=QuestCache(0, {}, frozenset()),
        quest_zone=quest_zone or {},
        zone_names=zone_names or {},
        seen_ids=seen_ids or set(),
    )


def test_build_quest_index_has_correct_columns() -> None:
    result = _make_index({1})
    assert result["columns"] == INDEX_COLUMNS


def test_build_quest_index_unnamed_quest_has_null_name_and_level_1() -> None:
    # Quest exists only in QuestV2, not in Classic db, not seen
    result = _make_index({999})
    rows = result["quests"]
    assert len(rows) == 1
    r = dict(zip(INDEX_COLUMNS, rows[0], strict=True))
    assert r["id"] == 999
    assert r["name"] is None
    assert r["level"] == 1


def test_build_quest_index_named_classic_quest() -> None:
    q = _quest(1, "Red Silk Bandanas", QuestLevel=22, MinLevel=17)
    result = _make_index({1}, src_quests={1: q}, keep={1: "A"})
    r = dict(zip(INDEX_COLUMNS, result["quests"][0], strict=True))
    assert r["name"] == "Red Silk Bandanas"
    assert r["level"] == 22
    assert r["minLevel"] == 17
    assert r["side"] == "A"


def test_build_quest_index_new_in_forever_flag() -> None:
    q = _quest(5, "New Quest")
    result = _make_index({5}, src_quests={5: q}, new_ids={5}, keep={5: "N"})
    r = dict(zip(INDEX_COLUMNS, result["quests"][0], strict=True))
    assert r["isNew"] is True


def test_build_quest_index_zone_id_from_quest_zone_map() -> None:
    q = _quest(10, "Quest with Zone")
    result = _make_index({10}, src_quests={10: q}, keep={10: "N"},
                         quest_zone={10: 1436}, zone_names={1436: "Westfall"})
    r = dict(zip(INDEX_COLUMNS, result["quests"][0], strict=True))
    assert r["zoneId"] == 1436


def test_build_quest_index_zones_list_sorted_by_name() -> None:
    quests = {i: _quest(i, f"Q{i}") for i in range(1, 4)}
    result = _make_index(
        {1, 2, 3},
        src_quests=quests,
        keep={1: "N", 2: "N", 3: "N"},
        quest_zone={1: 100, 2: 200, 3: 300},
        zone_names={100: "Westfall", 200: "Elwynn Forest", 300: "Dun Morogh"},
    )
    zone_names = [z[1] for z in result["zones"]]
    assert zone_names == sorted(zone_names)


def test_build_quest_index_counts_match_data() -> None:
    forever_ids = {1, 2, 3, 99}  # 99 is unnamed
    src_quests = {1: _quest(1, "Q1"), 2: _quest(2, "Q2"), 3: _quest(3, "Q3")}
    result = _make_index(forever_ids, src_quests=src_quests, keep={1: "N", 2: "N", 3: "N"}, seen_ids={1})
    c = result["counts"]
    assert c["total"] == 4
    assert c["named"] == 3
    assert c["withClassic"] == 3
    assert c["seenInGame"] == 1
    assert c["unnamed"] == 1


def test_build_quest_index_entries_sorted_by_id() -> None:
    forever_ids = {50, 10, 30}
    src_quests = {i: _quest(i, f"Q{i}") for i in forever_ids}
    result = _make_index(forever_ids, src_quests=src_quests, keep={i: "N" for i in forever_ids})
    ids = [r[INDEX_COLUMNS.index("id")] for r in result["quests"]]
    assert ids == sorted(ids)


# --- build_shards -------------------------------------------------------------


def test_build_shards_buckets_quests_by_id_mod_shard_count() -> None:
    quests = {q: _quest(q, f"Q{q}") for q in [0, 1, 64, 65]}
    src = _sources(quests)
    shards = build_shards({0, 1, 64, 65}, src, {0: "N", 1: "A", 64: "N", 65: "H"})
    assert len(shards) == SHARD_COUNT
    assert "0" in shards[0]["quests"]
    assert "1" in shards[1]["quests"]
    assert "64" in shards[0]["quests"]
    assert "65" in shards[1]["quests"]


def test_build_shards_all_shard_numbers_present() -> None:
    shards = build_shards(set(), _sources({}), {})
    assert set(shards) == set(range(SHARD_COUNT))


def test_build_shards_quest_not_in_classic_db_is_skipped() -> None:
    # Quest 999 is in forever_ids and keep, but not in src.quests → skip
    src = _sources({})
    shards = build_shards({999}, src, {999: "N"})
    for shard in shards.values():
        assert "999" not in shard["quests"]


def test_build_shards_keeps_only_forever_items_in_rewards() -> None:
    q = _quest(1, RewChoiceItemId1=2000, RewChoiceItemCount1=1,
               RewChoiceItemId2=3000, RewChoiceItemCount2=1)  # 3000 not in forever_items
    src = _sources({1: q})
    shards = build_shards({1}, src, {1: "N"})
    shard_row = shards[1 % SHARD_COUNT]["quests"]["1"]
    # choices column is at index QUEST_COLUMNS.index("choices")
    at_choices = QUEST_COLUMNS.index("choices")
    choices = shard_row[at_choices]
    assert all(item == 2000 for item, _ in choices)


def test_build_shards_quest_row_format_matches_quest_columns() -> None:
    q = _quest(10, "Test Quest")
    src = _sources({10: q})
    shards = build_shards({10}, src, {10: "A"})
    shard_row = shards[10 % SHARD_COUNT]["quests"]["10"]
    assert len(shard_row) == len(QUEST_COLUMNS)


# --- committed output ---------------------------------------------------------
# These tests require the generator to have been run (non-placeholder data).
# CI runs the full pipeline; locally they are skipped when the data is placeholder.


def _has_real_quest_data() -> bool:
    """True when the committed quest index has been generated (non-placeholder)."""
    try:
        doc = _load(INDEX_PATH)
        return bool(doc.get("quests"))
    except Exception:
        return False


REAL_DATA = pytest.mark.skipif(
    not _has_real_quest_data(),
    reason="quest index is placeholder — run python -m scripts.wow_quests.build first",
)


@REAL_DATA
def test_committed_quest_index_has_expected_format() -> None:
    doc = _load(INDEX_PATH)
    assert doc["columns"] == INDEX_COLUMNS
    assert isinstance(doc["quests"], list)
    assert len(doc["quests"]) > 0
    assert all(len(row) == len(INDEX_COLUMNS) for row in doc["quests"])


@REAL_DATA
def test_committed_quest_index_counts_are_positive() -> None:
    doc = _load(INDEX_PATH)
    c = doc["counts"]
    assert c["total"] > 0
    assert c["named"] > 0
    assert c["withClassic"] > 0
    # seenInGame may be 0 if no cache was provided during generation; don't assert > 0


@REAL_DATA
def test_committed_quest_index_has_sorted_zones() -> None:
    doc = _load(INDEX_PATH)
    zone_names = [z[1] for z in doc["zones"]]
    assert zone_names == sorted(zone_names)


def test_committed_shards_cover_all_numbers_and_match_quest_columns() -> None:
    """Every shard file (placeholder or real) must have the right column headers."""
    present = set()
    for path in CLASSIC_DIR.glob("[0-9]*.json"):
        if not path.stem.isdigit():
            continue
        n = int(path.stem)
        present.add(n)
        doc = _load(path)
        assert doc["questColumns"] == QUEST_COLUMNS, path.name
        for qid, row in doc["quests"].items():
            assert int(qid) % SHARD_COUNT == n, f"Quest {qid} in wrong shard {n}"
            assert len(row) == len(QUEST_COLUMNS), f"Wrong column count for {qid}"
    # All 64 placeholder shards must exist for the frontend glob to include them.
    assert present == set(range(SHARD_COUNT)), f"Missing shards: {set(range(SHARD_COUNT)) - present}"


@REAL_DATA
def test_committed_shards_quest_ids_match_their_shard() -> None:
    for path in sorted(CLASSIC_DIR.glob("[0-9]*.json")):
        n = int(path.stem)
        doc = _load(path)
        for qid in doc["quests"]:
            assert int(qid) % SHARD_COUNT == n


@REAL_DATA
def test_committed_seen_quests_are_in_the_index() -> None:
    # A seen quest can be new in Forever (no Classic shard row) but must be a Forever quest.
    seen = _load(SEEN_PATH)
    index = _load(INDEX_PATH)
    id_col = index["columns"].index("id")
    index_ids = {str(row[id_col]) for row in index["quests"]}
    for qid in seen["quests"]:
        assert qid in index_ids, f"Seen quest {qid} not in the quest index"


@REAL_DATA
def test_committed_reward_items_have_correct_columns() -> None:
    doc = _load(REWARD_ITEMS_PATH)
    assert doc["columns"] == REWARD_ITEM_COLUMNS
    assert isinstance(doc["items"], dict)
    for item_id, row in doc["items"].items():
        assert item_id.isdigit(), f"Non-numeric item key: {item_id}"
        assert len(row) == len(REWARD_ITEM_COLUMNS), f"Wrong column count for {item_id}"
        name, slot, item_type = row
        assert isinstance(name, str) and name, f"Empty name for item {item_id}"
        assert isinstance(slot, str), f"slot not str for item {item_id}"
