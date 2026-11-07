"""Tests for the WoW Forever dungeon pages' boss-loot generator (``scripts/wow_dungeons``).

Pure functions over small hand-made rows, then sanity checks on the committed
output. No network.
"""
from __future__ import annotations

import json
from typing import Any

from scripts.wow_dungeons.boss_loot import (
    boss_loot,
    creature_names,
    dungeon_loot,
    encounter_names,
    loot_item_rows,
)
from scripts.wow_dungeons.build import BOSS_LOOT_PATH, ITEMS_PATH, LOOT_ITEMS_PATH, WORLD_MAP_CLASSIC, dungeon_ids
from scripts.wow_gear.loot import creature_maps
from scripts.wow_item_pages.loot_chances import loot_index

BOSS_COLUMNS = ["encounter", "name", "x", "y", "z", "spots"]


def _loot(entry: int, item: int, chance: float, group: int = 0, ref: int = 1) -> dict[str, Any]:
    return {"entry": entry, "item": item, "ChanceOrQuestChance": chance, "groupid": group, "mincountOrRef": ref, "maxcount": 1}


def _template(entry: int, name: str, loot_id: int) -> dict[str, Any]:
    return {"Entry": entry, "Name": name, "LootId": loot_id, "Rank": 1, "MinLevel": 20, "MaxLevel": 20}


def _templates(*rows: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        out.setdefault(str(row["Name"]), []).append(row)
    return out


def _maps(spawns: list[tuple[int, int]], encounters: dict[int, set[str]] | None = None):
    return creature_maps([{"id": npc, "map": m} for npc, m in spawns], encounters or {})


def test_boss_loot_keeps_forever_items_most_likely_first() -> None:
    templates = _templates(_template(1, "Sneed", 10))
    creature_loot = loot_index([_loot(10, 100, 30.0), _loot(10, 101, 65.0), _loot(10, 999, 90.0)])
    rows = boss_loot(["Sneed"], 36, templates, _maps([(1, 36)]), creature_loot, {}, set(), {100, 101})
    # 999 is Classic-only: never shown.
    assert rows == [[101, 65.0], [100, 30.0]]


def test_boss_loot_drops_rare_rolls_and_quest_drops() -> None:
    templates = _templates(_template(1, "Boss", 10))
    creature_loot = loot_index([_loot(10, 100, 0.2), _loot(10, 101, -100.0), _loot(10, 102, 0.5)])
    rows = boss_loot(["Boss"], 36, templates, _maps([(1, 36)]), creature_loot, {}, set(), {100, 101, 102})
    assert rows == [[102, 0.5]]


def test_boss_loot_splits_an_equal_share_group() -> None:
    templates = _templates(_template(1, "Boss", 10))
    creature_loot = loot_index([_loot(10, 100, 0, group=1), _loot(10, 101, 0, group=1)])
    rows = boss_loot(["Boss"], 36, templates, _maps([(1, 36)]), creature_loot, {}, set(), {100, 101})
    assert rows == [[100, 50.0], [101, 50.0]]


def test_boss_loot_leaves_out_world_drop_pools_but_follows_own_references() -> None:
    templates = _templates(_template(1, "Boss", 10))
    creature_loot = loot_index([_loot(10, 0, 100.0, ref=-500), _loot(10, 0, 100.0, ref=-600)])
    references = loot_index([_loot(500, 100, 40.0), _loot(600, 101, 40.0)])
    rows = boss_loot(["Boss"], 36, templates, _maps([(1, 36)]), creature_loot, references, {600}, {100, 101})
    assert rows == [[100, 40.0]]


def test_boss_loot_only_counts_a_name_spawned_in_this_instance() -> None:
    templates = _templates(_template(1, "Boss", 10), _template(2, "Boss", 20))
    creature_loot = loot_index([_loot(10, 100, 50.0), _loot(20, 101, 50.0)])
    rows = boss_loot(["Boss"], 36, templates, _maps([(1, 36), (2, 0)]), creature_loot, {}, set(), {100, 101})
    assert rows == [[100, 50.0]]
    assert boss_loot(["Boss"], 43, templates, _maps([(1, 36), (2, 0)]), creature_loot, {}, set(), {100}) is None


def test_group_encounter_gives_what_any_member_drops_at_its_best_chance() -> None:
    names = creature_names("The Lost Dwarves")
    assert names == ("Baelog", 'Eric "The Swift"', "Olaf")
    templates = _templates(_template(1, "Baelog", 10), _template(2, "Olaf", 20))
    creature_loot = loot_index([_loot(10, 100, 20.0), _loot(20, 100, 35.0), _loot(20, 101, 10.0)])
    rows = boss_loot(names, 70, templates, _maps([(1, 70), (2, 70)]), creature_loot, {}, set(), {100, 101})
    assert rows == [[100, 35.0], [101, 10.0]]


def test_unspawned_boss_is_placed_by_its_encounter_alias() -> None:
    instances = {"289": {"bosses": [[1, "Kirtonos", None, None, None, 0]]}}
    encounters = encounter_names(instances, BOSS_COLUMNS)
    assert "Kirtonos the Herald" in encounters[289]
    templates = _templates(_template(1, "Kirtonos the Herald", 10))
    creature_loot = loot_index([_loot(10, 100, 25.0)])
    rows = boss_loot(creature_names("Kirtonos"), 289, templates, _maps([], encounters), creature_loot, {}, set(), {100})
    assert rows == [[100, 25.0]]


def test_dungeon_loot_keys_by_encounter_and_leaves_out_unmatched_bosses() -> None:
    instances = {
        "36": {"bosses": [[2741, "Rhahk'Zor", 1, 1, 1, 1], [9999, "Nobody", None, None, None, 0], [2742, "Sneed", 1, 1, 1, 1]]},
        "409": {"bosses": [[1, "Raid boss", 1, 1, 1, 1]]},
    }
    templates = _templates(_template(1, "Rhahk'Zor", 10), _template(2, "Sneed", 20))
    creature_loot = loot_index([_loot(10, 100, 95.0), _loot(20, 999, 50.0)])
    loot = dungeon_loot(instances, BOSS_COLUMNS, {36, 48}, templates, _maps([(1, 36), (2, 36)]), creature_loot, {}, set(), {100})
    # Sneed matched but drops nothing Forever has: an empty list, not left out.
    assert loot == {"36": {"2741": [[100, 95.0]], "2742": []}}


def test_loot_item_rows_names_every_item_from_items_json() -> None:
    columns = ["id", "name", "quality", "slot", "itemType"]
    items = {100: [100, "Cruel Barb", "rare", "one_hand", "Sword"], 101: [101, "Ring", "rare", "finger", None]}
    loot = {"36": {"1": [[101, 5.0]], "2": [[100, 20.0], [101, 1.0]]}}
    assert loot_item_rows(loot, items, columns) == {"100": ["Cruel Barb", "one_hand", "Sword"], "101": ["Ring", "finger", None]}


# --- the committed output ---


def _load(path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_committed_loot_covers_dungeons_only_and_names_every_item() -> None:
    boss_loot_doc = _load(BOSS_LOOT_PATH)
    items_doc = _load(LOOT_ITEMS_PATH)
    dungeons = dungeon_ids(_load(WORLD_MAP_CLASSIC / "classicDungeons.json"))
    assert {int(k) for k in boss_loot_doc["instances"]} <= dungeons
    forever = {row[0] for row in _load(ITEMS_PATH)["items"]}
    for bosses in boss_loot_doc["instances"].values():
        for rows in bosses.values():
            chances = [chance for _, chance in rows]
            assert chances == sorted(chances, reverse=True)
            for item, chance in rows:
                assert item in forever
                assert str(item) in items_doc["items"]
                assert 0.5 <= chance <= 100.0


def test_committed_loot_uses_the_interiors_encounter_ids() -> None:
    interiors = _load(WORLD_MAP_CLASSIC / "classicInteriors.json")
    for map_id, bosses in _load(BOSS_LOOT_PATH)["instances"].items():
        encounters = {str(b[0]) for b in interiors["instances"][map_id]["bosses"]}
        assert set(bosses) <= encounters


def test_committed_loot_pins_known_drops() -> None:
    deadmines = _load(BOSS_LOOT_PATH)["instances"]["36"]
    # Edwin VanCleef: Cape of the Brotherhood; Rhahk'Zor: his hammer.
    assert 5193 in {item for item, _ in deadmines["2747"]}
    assert deadmines["2741"][0][0] == 5187
