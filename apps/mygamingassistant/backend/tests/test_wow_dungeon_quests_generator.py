"""Tests for the dungeon pages' quest data (``scripts/wow_dungeons/quests.py``,
``quest_places.py``, ``quest_cache.py``).

Pure functions over small hand-made rows and a synthetic quest-cache record,
then checks on the committed output. No network, no game client.
"""
from __future__ import annotations

import json
import struct
from typing import Any

import pytest

from scripts.wow_dungeons.build import ITEMS_PATH, QUESTS_PATH, SEEN_QUESTS_PATH, forever_quest_sides
from scripts.wow_dungeons.quest_cache import (
    FIXED_INTS,
    HEADER_SIZE,
    MAGIC,
    STRING_LENGTH_BITS,
    STRING_LENGTH_BYTES,
    QuestCache,
    QuestCacheError,
    parse_quest,
    parse_quest_cache,
)
from scripts.wow_dungeons.quest_places import dungeon_areas, item_dungeons, only_on
from scripts.wow_dungeons.quests import (
    QUEST_COLUMNS,
    SEEN_COLUMNS,
    QuestSources,
    build_dungeon_quests,
    chain_after,
    chain_before,
    chain_ends,
    classic_objectives,
    distinct_quests,
    earlier_seen,
    predecessors,
    quest_row,
    select_quests,
    shown_level,
    successors,
)

DEADMINES = 36
TODAY = "2026-11-12"


# --- the quest cache --------------------------------------------------------------------------


def _record(quest_id: int, title: str, *, level: int = 20, min_level: int = 17,
            objectives: list[tuple[int, int, int]] = (), rewards: list[tuple[int, int]] = (),
            choices: list[tuple[int, int]] = (), effects: int = 1, flags: int = 0) -> bytes:
    """One quest record body in the client's layout."""
    ints = [0] * FIXED_INTS
    ints[0], ints[2], ints[4], ints[25], ints[109] = quest_id, level, min_level, flags, len(objectives)
    for k, (item, count) in enumerate(rewards):
        ints[29 + 4 * k], ints[30 + 4 * k] = item, count
    for k, (item, count) in enumerate(choices):
        ints[45 + 3 * k], ints[46 + 3 * k] = item, count
    body = struct.pack(f"<{FIXED_INTS}i", *ints)
    for n, (kind, obj, amount) in enumerate(objectives):
        text = f"objective {n}".encode()
        head = struct.pack("<iiBii", 900 + n, kind, n, obj, amount).ljust(33, b"\0")
        head += struct.pack("<i", effects).ljust(8, b"\0") + b"\x07\0\0\0" * effects
        body += head + bytes([len(text), 0]) + text
    strings = [title.encode(), b"Do the thing.", b"Go there."] + [b""] * 7
    value = 0
    for width, s in zip(STRING_LENGTH_BITS, strings, strict=True):
        value = (value << width) | len(s)
    value <<= STRING_LENGTH_BYTES * 8 - sum(STRING_LENGTH_BITS)
    return body + value.to_bytes(STRING_LENGTH_BYTES, "big") + b"".join(strings[:-1])


def _cache_file(*records: tuple[int, bytes]) -> bytes:
    data = MAGIC + struct.pack("<I", 70862) + b"SUne" + b"\0" * (HEADER_SIZE - 12)
    for quest_id, body in records:
        data += struct.pack("<II", quest_id, len(body)) + body
    return data + struct.pack("<II", 0, 0)


def test_parse_quest_reads_title_levels_objectives_and_rewards() -> None:
    body = _record(214, "Red Silk Bandanas", objectives=[(1, 915, 10), (0, 589, 15)],
                   rewards=[(2074, 1)], choices=[(6087, 1), (2059, 1)])
    quest = parse_quest(body)
    assert quest.title == "Red Silk Bandanas"
    assert (quest.level, quest.min_level) == (20, 17)
    assert quest.objectives == ((1, 915, 10), (0, 589, 15))
    assert quest.rewards == ((2074, 1),)
    assert quest.choices == ((6087, 1), (2059, 1))


def test_parse_quest_reads_whether_the_quest_can_be_shared() -> None:
    assert parse_quest(_record(1, "Shared", flags=8 | 2)).shareable
    assert not parse_quest(_record(2, "Solo", flags=2)).shareable


def test_parse_quest_refuses_a_record_whose_strings_dont_fit() -> None:
    with pytest.raises(QuestCacheError):
        parse_quest(_record(1, "Short") + b"extra")


def test_parse_quest_refuses_a_record_cut_off_inside_its_string_lengths() -> None:
    # The live cache has records like this; they used to crash the reader with "negative shift count".
    body = _record(1, "Cut")
    cut = body[:len(body) - len("Cut") - len("Do the thing.") - len("Go there.") - STRING_LENGTH_BYTES + 2]
    with pytest.raises(QuestCacheError):
        parse_quest(cut)
    cache = parse_quest_cache(_cache_file((1, cut), (214, _record(214, "Good"))))
    assert set(cache.quests) == {214}
    assert cache.unreadable == frozenset({1})


def test_parse_quest_cache_sets_aside_records_it_cant_read() -> None:
    cache = parse_quest_cache(_cache_file((214, _record(214, "Good")), (92456, _record(92456, "Writ") + b"??"),
                                          (7, _record(8, "Wrong id"))))
    assert cache.build == 70862
    assert set(cache.quests) == {214}
    assert cache.unreadable == frozenset({92456, 7})


def test_parse_quest_cache_rejects_other_files() -> None:
    with pytest.raises(QuestCacheError):
        parse_quest_cache(b"WDBC" + b"\0" * 40)


# --- where things are --------------------------------------------------------------------------


def test_dungeon_areas_match_names_and_the_map_area() -> None:
    names = {DEADMINES: "Deadmines", 90: "Gnomeregan"}
    areas = [{"ID": "1581", "AreaName_lang": "The Deadmines"}, {"ID": "133", "AreaName_lang": "Gnomeregan"},
             {"ID": "40", "AreaName_lang": "Westfall"}]
    maps = [{"ID": "36", "AreaTableID": "1581"}, {"ID": "90", "AreaTableID": "721"}, {"ID": "0", "AreaTableID": "40"}]
    assert dungeon_areas(names, areas, maps) == {1581: DEADMINES, 133: 90, 721: 90}


def test_only_on_needs_every_spawn_inside_one_dungeon() -> None:
    spawns = [{"id": 1, "map": DEADMINES}, {"id": 1, "map": DEADMINES}, {"id": 2, "map": DEADMINES},
              {"id": 2, "map": 0}, {"id": 3, "map": 0}]
    assert only_on(spawns, {DEADMINES}) == {1: DEADMINES}


def test_item_dungeons_follow_creature_and_chest_drops() -> None:
    creatures = [{"Entry": 1, "LootId": 10}, {"Entry": 2, "LootId": 20}]
    chests = [{"entry": 5, "type": 3, "data1": 50}, {"entry": 6, "type": 10, "data1": 60}]
    creature_loot = [{"entry": 10, "item": 100, "mincountOrRef": 1}, {"entry": 20, "item": 101, "mincountOrRef": 1},
                     {"entry": 10, "item": 102, "mincountOrRef": 1}, {"entry": 20, "item": 102, "mincountOrRef": 1},
                     {"entry": 10, "item": 9999, "mincountOrRef": -5}]
    chest_loot = [{"entry": 50, "item": 103, "mincountOrRef": 1}, {"entry": 60, "item": 104, "mincountOrRef": 1}]
    inside = item_dungeons(creatures, chests, creature_loot, chest_loot, {1: DEADMINES}, {5: DEADMINES, 6: DEADMINES})
    # 101 drops outside, 102 also outside, 104's object isn't a chest, a reference row is no item.
    assert inside == {100: DEADMINES, 103: DEADMINES}


# --- quests ------------------------------------------------------------------------------------


def _quest(entry: int, title: str = "Q", **fields: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "entry": entry, "Title": title, "QuestLevel": 20, "MinLevel": 17, "ZoneOrSort": 0, "RequiredRaces": 0,
        "RequiredClasses": 0, "PrevQuestId": 0, "NextQuestId": 0, "NextQuestInChain": 0, "QuestFlags": 0,
    }
    for i in range(1, 5):
        row |= {f"ReqCreatureOrGOId{i}": 0, f"ReqCreatureOrGOCount{i}": 0, f"ReqItemId{i}": 0, f"ReqItemCount{i}": 0,
                f"RewItemId{i}": 0, f"RewItemCount{i}": 0}
    for i in range(1, 7):
        row |= {f"RewChoiceItemId{i}": 0, f"RewChoiceItemCount{i}": 0}
    return row | fields


def test_shown_level_uses_the_required_level_for_your_level_quests() -> None:
    assert shown_level(-1, 55) == 55
    assert shown_level(24, 20) == 24


def test_classic_objectives_list_kills_and_objects_then_items() -> None:
    quest = _quest(1, ReqItemId1=915, ReqItemCount1=10, ReqCreatureOrGOId1=589, ReqCreatureOrGOCount1=15,
                   ReqCreatureOrGOId2=-1557, ReqCreatureOrGOCount2=1)
    assert classic_objectives(quest) == [("npc", 589, 15), ("object", 1557, 1), ("item", 915, 10)]


def test_chain_before_walks_back_through_forever_quests_of_the_same_side() -> None:
    quests = {
        1: _quest(1, NextQuestInChain=2),
        2: _quest(2, PrevQuestId=1),
        3: _quest(3, PrevQuestId=2),
        4: _quest(4, NextQuestId=3),  # Horde: not on an Alliance chain
        9: _quest(9, PrevQuestId=8),  # 8 isn't in Forever
    }
    before = predecessors(quests)
    keep = {1: "A", 2: "N", 3: "A", 4: "H", 9: "A"}
    assert chain_before(3, before, keep) == [1, 2]
    assert chain_before(9, before, keep) == []


def test_chain_after_walks_on_through_forever_quests_of_the_same_side() -> None:
    quests = {
        1: _quest(1, NextQuestInChain=2),
        2: _quest(2),
        3: _quest(3, PrevQuestId=2),
        4: _quest(4, PrevQuestId=3),  # Horde: not on an Alliance chain
        5: _quest(5, PrevQuestId=2),  # a second way on: the first link wins
    }
    after = successors(quests)
    keep = {1: "A", 2: "N", 3: "A", 4: "H", 5: "A"}
    assert chain_after(1, after, keep, []) == [2, 3]
    assert chain_after(4, after, keep, []) == []


def test_a_line_for_both_factions_never_turns_into_one_factions() -> None:
    quests = {
        1: _quest(1, NextQuestInChain=2),
        2: _quest(2, PrevQuestId=1),  # Alliance only
        3: _quest(3, PrevQuestId=1),  # Horde only
        4: _quest(4, PrevQuestId=1),  # both
    }
    keep = {1: "N", 2: "A", 3: "H", 4: "N"}
    assert chain_after(1, successors(quests), keep, []) == [4]
    assert chain_before(2, predecessors(quests), keep) == [1]
    assert chain_after(1, successors(quests), {1: "N", 2: "A", 3: "H"}, []) == []


def test_chain_after_never_leads_back_to_a_quest_before_it() -> None:
    quests = {1: _quest(1, NextQuestId=2), 2: _quest(2, NextQuestId=1)}
    assert chain_after(2, successors(quests), {1: "A", 2: "A"}, [1]) == []


def test_chain_before_stops_on_a_loop() -> None:
    quests = {1: _quest(1, PrevQuestId=2), 2: _quest(2, PrevQuestId=1)}
    assert chain_before(1, predecessors(quests), {1: "N", 2: "N"}) == [2]


def test_select_quests_takes_the_dungeons_area_and_objectives_only_inside() -> None:
    quests = {
        1: _quest(1, ZoneOrSort=1581),
        2: _quest(2, ZoneOrSort=40, ReqItemId1=100, ReqItemCount1=1),
        3: _quest(3, ZoneOrSort=40, ReqCreatureOrGOId1=7, ReqCreatureOrGOCount1=1),
        4: _quest(4, ZoneOrSort=1581),  # not in Forever
    }
    picked = select_quests(quests, {1581: DEADMINES}, {"item:100": DEADMINES}, {1: "A", 2: "A", 3: "A"})
    assert picked == {DEADMINES: [1, 2]}


def _sources(quests: dict[int, dict[str, Any]], **over: Any) -> QuestSources:
    base: dict[str, Any] = {
        "quests": quests,
        "world_givers": {},
        "offered_by": {},
        "ended_by": {},
        "started_by": {},
        "names": {"npc:1": "Gryan Stoutmantle", "npc:7": "Edwin VanCleef", "item:100": "Head of VanCleef"},
        "inside": {"npc:7": DEADMINES, "item:100": DEADMINES},
        "forever_items": {2000},
    }
    return QuestSources(**(base | over))


def test_quest_row_places_givers_and_keeps_forever_rewards_only() -> None:
    quests = {166: _quest(166, "The Defias Brotherhood", ReqItemId1=100, ReqItemCount1=1,
                          RewChoiceItemId1=2000, RewChoiceItemCount1=1, RewChoiceItemId2=3000, RewChoiceItemCount2=1)}
    world = {166: [[0, "npc", 1, "Gryan Stoutmantle", 40, "Sentinel Hill", 56.3, 47.5, 166]]}
    src = _sources(quests, world_givers=world, ended_by={166: [("npc", 1)]})
    row = quest_row(166, "A", [], [], src).as_json()
    by = dict(zip(QUEST_COLUMNS, row, strict=True))
    assert by["givers"] == [["npc", 1, "Gryan Stoutmantle", 40, "Sentinel Hill", 56.3, 47.5, None]]
    assert by["objectives"] == [["item", 100, 1]]
    assert by["choices"] == [[2000, 1]]
    assert by["enders"] == ["npc:1"]


def test_distinct_quests_drop_a_repeat_offered_by_another_object_of_the_same_name() -> None:
    quests = {n: _quest(n, "The Sparklematic 5200!", ReqItemId1=100, ReqItemCount1=1) for n in (2951, 4601)}
    names = {"object:1": "The Sparklematic 5200", "object:2": "The Sparklematic 5200", "item:100": "Grime-Encrusted Ring"}
    inside = {"object:1": 90, "object:2": 90, "item:100": 90}
    src = _sources(quests, names=names, inside=inside, offered_by={2951: [("object", 1)], 4601: [("object", 2)]})
    rows = {q: quest_row(q, "N", [], [], src) for q in quests}
    assert distinct_quests([2951, 4601], rows) == [2951]


def test_chain_ends_hides_a_step_another_listed_quest_leads_on_from() -> None:
    src = _sources({1: _quest(1), 2: _quest(2)})
    rows = {1: quest_row(1, "N", [], [], src), 2: quest_row(2, "N", [1], [], src)}
    assert chain_ends([1, 2], rows) == [2]


def test_build_dungeon_quests_lists_chain_steps_and_stops_on_an_unreadable_cached_quest() -> None:
    quests = {
        10: _quest(10, "Lead in", ZoneOrSort=40, NextQuestInChain=11),
        11: _quest(11, "Kill VanCleef", ZoneOrSort=40, ReqCreatureOrGOId1=7, ReqCreatureOrGOCount1=1,
                   PrevQuestId=10, RewItemId1=2000, RewItemCount1=1),
    }
    src = _sources(quests)
    result = build_dungeon_quests(src, {}, {10: "A", 11: "A"}, QuestCache(1, {}, frozenset()), TODAY, {})
    assert result.instances == {str(DEADMINES): [11]}
    assert set(result.quests) == {"10", "11"}
    assert result.targets == {"npc:7": ["Edwin VanCleef", DEADMINES]}
    assert result.item_ids == frozenset({2000})
    lead_in = dict(zip(QUEST_COLUMNS, result.quests["10"], strict=True))
    assert lead_in["after"] == [11]
    assert dict(zip(QUEST_COLUMNS, result.quests["11"], strict=True))["chain"] == [10]
    with pytest.raises(SystemExit):
        build_dungeon_quests(src, {}, {10: "A", 11: "A"}, QuestCache(1, {}, frozenset({10})), TODAY, {})


def test_build_dungeon_quests_lists_the_quests_after_and_whether_each_can_be_shared() -> None:
    quests = {
        11: _quest(11, "Kill VanCleef", ZoneOrSort=40, ReqCreatureOrGOId1=7, ReqCreatureOrGOCount1=1, QuestFlags=8),
        12: _quest(12, "Report back", PrevQuestId=11, QuestFlags=2),
    }
    cached = parse_quest(_record(12, "Report back", flags=8))
    result = build_dungeon_quests(_sources(quests), {}, {11: "A", 12: "A"}, QuestCache(1, {12: cached}, frozenset()), TODAY, {})
    assert result.instances == {str(DEADMINES): [11]}
    kill = dict(zip(QUEST_COLUMNS, result.quests["11"], strict=True))
    report = dict(zip(QUEST_COLUMNS, result.quests["12"], strict=True))
    assert (kill["after"], kill["shareable"], report["shareable"]) == ([12], True, False)
    # The client says the follow-up can be shared; the page prefers that.
    seen = dict(zip(SEEN_COLUMNS, result.seen["12"], strict=True))
    assert (seen["shareable"], seen["seenOn"]) == (True, TODAY)


def _earlier_file(**over: Any) -> dict[str, Any]:
    """A seen file as the last run wrote it, before the per-quest day and sharing columns."""
    return {
        "seenOn": "2026-11-07",
        "columns": ["title", "level", "minLevel", "objectives", "rewards", "choices"],
        "quests": {
            "11": ["Kill VanCleef!", 21, 17, [["npc", 7, 1], ["npc", 404, 1]], [[2000, 2], [8888, 1]], []],
            "99": ["Not a dungeon quest", 10, 5, [], [], []],
        },
    } | over


def test_earlier_seen_reads_an_old_file_with_its_own_day_and_unknown_sharing() -> None:
    earlier = earlier_seen(_earlier_file())
    assert set(earlier) == {11, 99}
    assert (earlier[11].seen_on, earlier[11].shareable, earlier[11].objectives[0]) == ("2026-11-07", None, ("npc", 7, 1))
    assert earlier_seen({"seenOn": "2026-11-07"}) == {}


def test_build_dungeon_quests_keeps_what_an_earlier_cache_saw_after_a_patch_emptied_it() -> None:
    quests = {11: _quest(11, "Kill VanCleef", ZoneOrSort=40, ReqCreatureOrGOId1=7, ReqCreatureOrGOCount1=1, QuestFlags=8)}
    result = build_dungeon_quests(_sources(quests), {}, {11: "A"}, QuestCache(2, {}, frozenset()), TODAY,
                                  earlier_seen(_earlier_file()))
    # Only the dungeon's own quests carry over, trimmed to the names and Forever items this run has.
    assert set(result.seen) == {"11"}
    seen = dict(zip(SEEN_COLUMNS, result.seen["11"], strict=True))
    assert (seen["title"], seen["seenOn"], seen["shareable"]) == ("Kill VanCleef!", "2026-11-07", None)
    assert (seen["objectives"], seen["rewards"]) == ([["npc", 7, 1]], [[2000, 2]])


def test_build_dungeon_quests_prefers_the_new_cache_over_an_earlier_one() -> None:
    quests = {11: _quest(11, "Kill VanCleef", ZoneOrSort=40, ReqCreatureOrGOId1=7, ReqCreatureOrGOCount1=1)}
    cache = QuestCache(2, {11: parse_quest(_record(11, "Kill VanCleef (new)", flags=8))}, frozenset())
    result = build_dungeon_quests(_sources(quests), {}, {11: "A"}, cache, TODAY, earlier_seen(_earlier_file()))
    seen = dict(zip(SEEN_COLUMNS, result.seen["11"], strict=True))
    assert (seen["title"], seen["seenOn"], seen["shareable"]) == ("Kill VanCleef (new)", TODAY, True)


def test_forever_quest_sides_keep_only_forever_quests_with_a_side() -> None:
    quests = {1: _quest(1, RequiredRaces=77), 2: _quest(2, RequiredRaces=178), 3: _quest(3)}
    assert forever_quest_sides(quests, {1, 3, 99}) == {1: "A", 3: "N"}


# --- the committed output ----------------------------------------------------------------------


def _load(path: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_quests_are_complete_and_point_at_known_things() -> None:
    doc = _load(QUESTS_PATH)
    items = {int(r[0]) for r in _load(ITEMS_PATH)["items"]}
    cols = doc["questColumns"]
    assert cols == QUEST_COLUMNS
    for instance, ids in doc["instances"].items():
        assert ids, instance
        for qid in ids:
            row = dict(zip(cols, doc["quests"][str(qid)], strict=True))
            for step in row["chain"] + row["after"]:
                assert str(step) in doc["quests"]
            assert isinstance(row["shareable"], bool)
            for kind, entry, _ in row["objectives"]:
                assert f"{kind}:{entry}" in doc["targets"]
            for item, _ in row["rewards"] + row["choices"]:
                assert item in items


def test_committed_gnomeregan_lists_the_sparklematic_once() -> None:
    doc = _load(QUESTS_PATH)
    titles = [doc["quests"][str(q)][1] for q in doc["instances"]["90"]]
    assert titles.count("The Sparklematic 5200!") == 1


def test_committed_seen_quests_are_dungeon_quests() -> None:
    seen = _load(SEEN_QUESTS_PATH)
    quests = _load(QUESTS_PATH)["quests"]
    assert seen["clientBuild"] > 0
    assert seen["columns"] == SEEN_COLUMNS
    assert set(seen["quests"]) <= set(quests)
    for row in seen["quests"].values():
        by = dict(zip(SEEN_COLUMNS, row, strict=True))
        assert by["shareable"] in (True, False, None)
        assert by["seenOn"] <= seen["seenOn"]
