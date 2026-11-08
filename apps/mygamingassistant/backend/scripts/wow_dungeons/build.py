"""Build the WoW Forever dungeon pages' boss loot, quests and entry facts (``/wow-forever/dungeons/:slug``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_dungeons.build [--quest-cache <questcache.wdb>]

Run after the World Map and Items generators: it reads their committed output
(``classicDungeons.json``, ``classicInteriors.json``, ``classicQuests.json``,
``items.json``). Everything else a dungeon page shows — levels, entrances,
bosses in order — the page reads from the World Map's files directly.

The quests' "Seen in game" facts come from the operator's own Forever client:
``--quest-cache``, else ``WOW_FOREVER_QUEST_CACHE``, else the default install
path (``quest_cache.py``). The run stops without it. The cache is read, never
committed.

Writes six files; the Forever ones and the Classic ones are kept apart
because their licences differ:

* ``data/dungeons/lootItems.json`` — from the Forever client (``items.json``):
  name, slot and type of every item the loot and the quest rewards name.
* ``data/dungeons/dungeonFacts.json`` — from the Forever client (wago.tools
  ``Map``): each dungeon's group size (``MaxPlayers``).
* ``data/dungeons/dungeonQuestsSeen.json`` — the Forever client's quest cache:
  title, levels, objectives and rewards of the dungeon quests the operator's
  client has seen.
* ``data/dungeons/classic/bossLoot.json`` — cmangos classic-db (GPL-3.0,
  LICENSE + README next to it): per dungeon, per Forever encounter, the items it
  drops with the chance the server rolls.
* ``data/dungeons/classic/entryRequirements.json`` — cmangos
  ``areatrigger_teleport``: entrances that need an item or a finished quest
  (none of the Classic dungeons do; only raids).
* ``data/dungeons/classic/dungeonQuests.json`` — cmangos (``quests.py``): each
  dungeon's quests that the Forever client has (``QuestV2``), the quests
  before them, who gives them and where, objectives and Forever rewards.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import argparse
import json
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

from scripts.wow_dungeons.boss_loot import LOOT_COLUMNS, dungeon_loot, encounter_names, loot_item_rows
from scripts.wow_dungeons.entry import ENTRY_COLUMNS, entry_requirements, group_sizes
from scripts.wow_dungeons.quest_cache import QuestCache, quest_cache_path, read_quest_cache
from scripts.wow_dungeons.quest_places import dungeon_areas, item_dungeons, only_on
from scripts.wow_dungeons.quests import (
    GIVER_COLUMNS,
    KIND_ITEM,
    KIND_NPC,
    KIND_OBJECT,
    OBJECTIVE_COLUMNS,
    QUEST_COLUMNS,
    SEEN_COLUMNS,
    TARGET_COLUMNS,
    DungeonQuests,
    QuestSources,
    build_dungeon_quests,
    target_key,
)
from scripts.wow_food.build import CLASSIC_LICENSE, WOW_DATA_DIR
from scripts.wow_gear.build import write_json
from scripts.wow_gear.loot import creature_maps
from scripts.wow_item_pages.loot_chances import loot_index, world_pools
from scripts.wow_world_map.quests import GIVER_COLUMNS as WORLD_GIVER_COLUMNS
from scripts.wow_world_map.quests import quest_side
from scripts.wow_world_map.sources import CMANGOS_COMMIT, WAGO_BRANCH, WAGO_BUILD, cmangos_dump, wago_table
from scripts.wow_world_map.sql_dump import SqlValue, read_dump

ITEMS_PATH = WOW_DATA_DIR / "items" / "items.json"
WORLD_MAP_CLASSIC = WOW_DATA_DIR / "worldMap" / "classic"
DUNGEONS_DIR = WOW_DATA_DIR / "dungeons"
LOOT_ITEMS_PATH = DUNGEONS_DIR / "lootItems.json"
CLASSIC_DIR = DUNGEONS_DIR / "classic"
BOSS_LOOT_PATH = CLASSIC_DIR / "bossLoot.json"
ENTRY_PATH = CLASSIC_DIR / "entryRequirements.json"
QUESTS_PATH = CLASSIC_DIR / "dungeonQuests.json"
FACTS_PATH = DUNGEONS_DIR / "dungeonFacts.json"
SEEN_QUESTS_PATH = DUNGEONS_DIR / "dungeonQuestsSeen.json"
LOOT_ITEM_COLUMNS = ["name", "slot", "itemType"]
DUNGEON = "dungeon"

Tables = dict[str, list[dict[str, SqlValue]]]

CLASSIC_README = """# Dungeon pages — Classic boss loot and quests

`entryRequirements.json` lists the dungeon entrances that need an item or a
finished quest (`areatrigger_teleport` `required_item` / `required_quest_done`);
an instance that isn't in it needs nothing beyond a level.

`bossLoot.json` lists, for each dungeon (instance map id) and each boss (the
Forever client's `DungeonEncounter` id), the items it drops and the chance the
server rolls per kill, most likely first. Loot is followed the way the item
pages follow it (equal-share groups, references rolled `maxcount` times, a
reference ten or more creatures share is a random world drop and left out).
Only items the WoW Forever client has (`items/items.json`) are kept — never an
item from Classic alone — and chances under 0.5% are left out.

`dungeonQuests.json` lists each dungeon's quests (instance map id -> quest
ids, lowest level first) and every quest it names: those and the quests you do
before them (`PrevQuestId`, `NextQuestId`, `NextQuestInChain`). Per quest:
levels, who may take it (`RequiredRaces` / `RequiredClasses`), who gives it —
out in the world at the World Map's spot (`classicQuests.json`), inside the
dungeon, or an item — its objectives, the reward items and the ones to choose
from, and who takes it back. `targets` names what objectives and enders point
at and the dungeon it only appears in (null = also outside). A dungeon's quests
are the ones filed under it (`ZoneOrSort`) and the ones with an objective only
found inside it. Only quests the WoW Forever client has (`QuestV2`) and reward
items it has (`items/items.json`) are kept.

Derived from [cmangos classic-db](https://github.com/cmangos/classic-db) at
commit `{commit}` (`creature_template`, `creature`, `creature_loot_template`,
`reference_loot_template`, `areatrigger_teleport`, `quest_template`,
`*_questrelation`, `*_involvedrelation`, `gameobject`, `gameobject_template`,
`gameobject_loot_template`, `item_template`), licensed GPL-3.0 — see `LICENSE`.
No cmangos code is used. Forever may differ: the page tags all of it "Classic data".

Generated by `backend/scripts/wow_dungeons/build.py`. Never hand-edit.
"""


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def dungeon_ids(dungeon_doc: dict[str, Any]) -> set[int]:
    """Instance map ids of the World Map's dungeon (not raid) entrances."""
    columns = dungeon_doc["columns"]
    at_instance, at_type = columns.index("instance"), columns.index("type")
    return {int(r[at_instance]) for r in dungeon_doc["rows"] if r[at_type] == DUNGEON}


def dungeon_names(dungeon_doc: dict[str, Any], dungeons: set[int]) -> dict[int, str]:
    columns = dungeon_doc["columns"]
    at_instance, at_name = columns.index("instance"), columns.index("name")
    return {int(r[at_instance]): str(r[at_name]) for r in dungeon_doc["rows"] if int(r[at_instance]) in dungeons}


def givers_by_quest(world_quests: dict[str, Any]) -> dict[int, list[list[object]]]:
    """Quest -> the World Map's giver rows that offer it (placed out in the world)."""
    at_quests = WORLD_GIVER_COLUMNS.index("quests")
    out: dict[int, list[list[object]]] = defaultdict(list)
    for row in world_quests["givers"]:
        for quest in row[at_quests]:
            out[int(quest)].append(row)
    return out


def _relations(rows: list[dict[str, SqlValue]], kind: str, into: dict[int, list[tuple[str, int]]]) -> None:
    for r in sorted(rows, key=lambda r: (int(str(r["quest"])), int(str(r["id"])))):
        into[int(str(r["quest"]))].append((kind, int(str(r["id"]))))


def _inside(tables: Tables, dungeons: set[int]) -> dict[str, int]:
    """Target key -> the dungeon it's only found in: creatures, objects, and the items they drop."""
    npc = only_on(tables["creature"], dungeons)
    obj = only_on(tables["gameobject"], dungeons)
    item = item_dungeons(
        tables["creature_template"], tables["gameobject_template"],
        tables["creature_loot_template"], tables["gameobject_loot_template"], npc, obj,
    )
    return (
        {target_key(KIND_NPC, e): m for e, m in npc.items()}
        | {target_key(KIND_OBJECT, e): m for e, m in obj.items()}
        | {target_key(KIND_ITEM, e): m for e, m in item.items()}
    )


def quest_sources(tables: Tables, world_quests: dict[str, Any], dungeons: set[int], forever_items: set[int]) -> QuestSources:
    """The cmangos and World Map facts the dungeon quests are built from."""
    names = (
        {target_key(KIND_NPC, int(str(r["Entry"]))): str(r["Name"]) for r in tables["creature_template"]}
        | {target_key(KIND_OBJECT, int(str(r["entry"]))): str(r["name"]) for r in tables["gameobject_template"]}
        | {target_key(KIND_ITEM, int(str(r["entry"]))): str(r["name"]) for r in tables["item_template"]}
    )
    offered_by: dict[int, list[tuple[str, int]]] = defaultdict(list)
    ended_by: dict[int, list[tuple[str, int]]] = defaultdict(list)
    _relations(tables["creature_questrelation"], KIND_NPC, offered_by)
    _relations(tables["gameobject_questrelation"], KIND_OBJECT, offered_by)
    _relations(tables["creature_involvedrelation"], KIND_NPC, ended_by)
    _relations(tables["gameobject_involvedrelation"], KIND_OBJECT, ended_by)
    started_by: dict[int, list[int]] = defaultdict(list)
    for item in sorted(tables["item_template"], key=lambda r: int(str(r["entry"]))):
        if int(str(item["startquest"])) > 0:
            started_by[int(str(item["startquest"]))].append(int(str(item["entry"])))
    return QuestSources(
        quests={int(str(q["entry"])): q for q in tables["quest_template"]},
        world_givers=givers_by_quest(world_quests),
        offered_by=offered_by,
        ended_by=ended_by,
        started_by=started_by,
        names=names,
        inside=_inside(tables, dungeons),
        forever_items=forever_items,
    )


def forever_quest_sides(quests: dict[int, dict[str, SqlValue]], forever_ids: set[int]) -> dict[int, str]:
    """Quest -> who may take it, for the Classic quests the Forever client has (``QuestV2``)."""
    out: dict[int, str] = {}
    for qid in sorted(forever_ids & set(quests)):
        side = quest_side(int(str(quests[qid]["RequiredRaces"])))
        if side is not None:
            out[qid] = side
    return out


def write_quests(result: DungeonQuests, cache: QuestCache, seen_on: str, classic_source: dict[str, str]) -> None:
    write_json(QUESTS_PATH, {
        "source": classic_source,
        "questColumns": QUEST_COLUMNS,
        "giverColumns": GIVER_COLUMNS,
        "objectiveColumns": OBJECTIVE_COLUMNS,
        "targetColumns": TARGET_COLUMNS,
        "instances": result.instances,
        "quests": result.quests,
        "targets": result.targets,
    })
    write_json(SEEN_QUESTS_PATH, {
        "source": "The WoW Forever client's quest cache (Cache/WDB/enUS/questcache.wdb) on the operator's machine",
        "clientBuild": cache.build,
        "seenOn": seen_on,
        "attribution": "Game data from the WoW Forever client. © Blizzard Entertainment.",
        "columns": SEEN_COLUMNS,
        "quests": result.seen,
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever dungeon pages' data.")
    parser.add_argument("--quest-cache", help="the Forever client's Cache/WDB/enUS/questcache.wdb")
    cache, seen_on = read_quest_cache(quest_cache_path(parser.parse_args().quest_cache))
    interiors = _load_json(WORLD_MAP_CLASSIC / "classicInteriors.json")
    dungeon_doc = _load_json(WORLD_MAP_CLASSIC / "classicDungeons.json")
    dungeons = dungeon_ids(dungeon_doc)
    items_doc = _load_json(ITEMS_PATH)
    items = {int(row[0]): row for row in items_doc["items"]}
    print("Reading cmangos classic-db...")
    tables = read_dump(
        cmangos_dump(),
        {
            "creature", "creature_template", "creature_loot_template", "reference_loot_template", "areatrigger_teleport",
            "quest_template", "creature_questrelation", "gameobject_questrelation", "creature_involvedrelation",
            "gameobject_involvedrelation", "gameobject", "gameobject_template", "gameobject_loot_template", "item_template",
        },
    )
    templates_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for template in tables["creature_template"]:
        templates_by_name[str(template["Name"])].append(template)
    creature_loot = loot_index(tables["creature_loot_template"])
    maps_of = creature_maps(tables["creature"], encounter_names(interiors["instances"], interiors["bossColumns"]))
    loot = dungeon_loot(
        interiors["instances"], interiors["bossColumns"], dungeons, templates_by_name, maps_of,
        creature_loot, loot_index(tables["reference_loot_template"]), world_pools(creature_loot), set(items),
    )
    src = quest_sources(tables, _load_json(WORLD_MAP_CLASSIC / "classicQuests.json"), dungeons, set(items))
    keep = forever_quest_sides(dict(src.quests), {int(r["ID"]) for r in wago_table("QuestV2", hotfixes=True)})
    areas = dungeon_areas(dungeon_names(dungeon_doc, dungeons), wago_table("AreaTable"), wago_table("Map"))
    quests = build_dungeon_quests(src, areas, keep, cache)
    write_json(LOOT_ITEMS_PATH, {
        "source": items_doc["source"],
        "clientBuild": items_doc["clientBuild"],
        "attribution": items_doc["attribution"],
        "columns": LOOT_ITEM_COLUMNS,
        "items": loot_item_rows(loot, items, items_doc["columns"], quests.item_ids),
    })
    write_json(FACTS_PATH, {
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} (Map)",
        "clientBuild": WAGO_BUILD,
        "attribution": "Game data from the WoW Forever client via wago.tools. © Blizzard Entertainment.",
        "maxPlayers": group_sizes(wago_table("Map"), dungeons),
    })
    classic_source = {"repo": "cmangos/classic-db", "commit": CMANGOS_COMMIT, "license": "GPL-3.0-or-later"}
    write_json(BOSS_LOOT_PATH, {"source": classic_source, "lootColumns": LOOT_COLUMNS, "instances": loot})
    write_json(ENTRY_PATH, {
        "source": classic_source,
        "columns": ENTRY_COLUMNS,
        "instances": entry_requirements(tables["areatrigger_teleport"], dungeons),
    })
    write_quests(quests, cache, seen_on, classic_source)
    shutil.copyfile(CLASSIC_LICENSE, CLASSIC_DIR / "LICENSE")
    (CLASSIC_DIR / "README.md").write_text(CLASSIC_README.format(commit=CMANGOS_COMMIT), encoding="utf-8")
    bosses = sum(len(b) for b in loot.values())
    with_loot = sum(1 for b in loot.values() for rows in b.values() if rows)
    print(f"{len(loot)} dungeons, {bosses} bosses matched, {with_loot} with Forever loot -> {DUNGEONS_DIR}")
    shown = sum(len(ids) for ids in quests.instances.values())
    print(
        f"{shown} dungeon quests ({len(quests.quests)} with the quests before them), "
        f"{len(quests.seen)} seen in the client cache (build {cache.build}, {seen_on}), "
        f"{len(quests.item_ids)} reward items"
    )


if __name__ == "__main__":
    main()
