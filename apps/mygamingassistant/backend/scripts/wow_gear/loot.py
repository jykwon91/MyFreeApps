"""Classic loot (cmangos classic-db): what bosses drop, and what only raids give."""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from typing import Any

Row = Mapping[str, Any]

# Classic creature ranks (creature_template.Rank).
RANK_ELITE = 1
RANK_BOSS = 3
# Map.InstanceType in the Forever client.
INSTANCE_DUNGEON = 1
INSTANCE_RAID = 2
CLASSIC_CONTINENTS = frozenset({0, 1})
# A loot reference more than one creature loot table points at is a shared
# pool (world drops, a level range's BoE greens/blues), not that boss's own
# loot: following those made "Cookie" in the Deadmines drop items Ragefire
# Chasm and Zul'Farrak bosses also drop.
WORLD_DROP_POOL_USERS = 1
MAX_REFERENCE_DEPTH = 4
MAX_SOURCES_PER_ITEM = 3


def as_int(value: object) -> int:
    try:
        return int(float(str(value or 0)))
    except ValueError:
        return 0


def loot_index(rows: Iterable[Row]) -> dict[int, list[Row]]:
    index: dict[int, list[Row]] = defaultdict(list)
    for row in rows:
        index[as_int(row["entry"])].append(row)
    return index


def _world_drop_pools(creature_loot: Mapping[int, list[Row]]) -> set[int]:
    users: dict[int, int] = defaultdict(int)
    for rows in creature_loot.values():
        for ref in {-as_int(r["mincountOrRef"]) for r in rows if as_int(r["mincountOrRef"]) < 0}:
            users[ref] += 1
    return {ref for ref, count in users.items() if count > WORLD_DROP_POOL_USERS}


def loot_items(
    entry: int,
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
) -> set[int]:
    """Every item a creature loot entry can drop, following references (not world-drop pools).

    Rows with a negative chance are quest drops (only on that quest), so they
    don't count as gear the boss drops.
    """
    found: set[int] = set()
    seen: set[int] = set()

    def walk(rows: list[Row], depth: int) -> None:
        for row in rows:
            ref = as_int(row["mincountOrRef"])
            if ref < 0:
                if -ref in pools or -ref in seen or depth >= MAX_REFERENCE_DEPTH:
                    continue
                seen.add(-ref)
                walk(references.get(-ref, []), depth + 1)
            elif float(str(row["ChanceOrQuestChance"] or 0)) >= 0:
                found.add(as_int(row["item"]))

    walk(list(creature_loot.get(entry, [])), 0)
    return found


def table_items(index: Mapping[int, list[Row]], references: Mapping[int, list[Row]], entries: Iterable[int]) -> set[int]:
    """Every item the given loot entries can give, following references; quest drops included."""
    found: set[int] = set()
    seen: set[int] = set()

    def walk(rows: Iterable[Row], depth: int) -> None:
        for row in rows:
            ref = as_int(row["mincountOrRef"])
            if ref >= 0:
                found.add(as_int(row["item"]))
            elif -ref not in seen and depth < MAX_REFERENCE_DEPTH:
                seen.add(-ref)
                walk(references.get(-ref, []), depth + 1)

    for entry in sorted(set(entries)):
        walk(index.get(entry, []), 0)
    return found - {0}


def creature_maps(spawns: Iterable[Row], encounters: Mapping[int, set[str]]) -> Callable[[Row], set[int]]:
    """Where a creature stands: its spawns' maps, else (no fixed spawn, e.g. Nefarian) its encounter's map."""
    maps_of: dict[int, set[int]] = defaultdict(set)
    for spawn in spawns:
        maps_of[as_int(spawn["id"])].add(as_int(spawn["map"]))
    encounter_maps: dict[str, set[int]] = defaultdict(set)
    for map_id, names in encounters.items():
        for name in names:
            encounter_maps[name].add(map_id)
    return lambda template: maps_of.get(as_int(template["Entry"])) or encounter_maps.get(str(template["Name"]), set())


def _raid_like(map_id: int, rank: int, instance_types: Mapping[int, int]) -> bool:
    """A raid, or a world boss (rank "boss" on a continent) — not in Forever yet."""
    return instance_types.get(map_id) == INSTANCE_RAID or (map_id in CLASSIC_CONTINENTS and rank == RANK_BOSS)


def creature_items_by_place(
    templates: Iterable[Row],
    maps_of: Callable[[Row], set[int]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    instance_types: Mapping[int, int],
) -> tuple[set[int], set[int]]:
    """(items raid creatures and world bosses drop, items any other creature drops).

    A creature placed nowhere counts for neither.
    """
    raid_loot: set[int] = set()
    other_loot: set[int] = set()
    for template in templates:
        loot_id = as_int(template.get("LootId"))
        if loot_id <= 0:
            continue
        rank = as_int(template.get("Rank"))
        for map_id in maps_of(template):
            (raid_loot if _raid_like(map_id, rank, instance_types) else other_loot).add(loot_id)
    return (
        table_items(creature_loot, references, raid_loot),
        table_items(creature_loot, references, other_loot),
    )


def boss_drops(
    templates: Iterable[Row],
    maps_of: Callable[[Row], set[int]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    instance_types: Mapping[int, int],
    encounters: Mapping[int, set[str]],
    gear_ids: set[int],
) -> tuple[dict[int, list[list[Any]]], set[int]]:
    """(item id -> [[boss, dungeon map id], ...], ids raid or world bosses drop that no dungeon boss does).

    A boss is a creature of rank "boss" spawned in an instance or on a
    continent (a world boss), or an elite named by a Forever DungeonEncounter
    of the map it stands on (bosses the client lists by name).
    """
    pools = _world_drop_pools(creature_loot)
    dungeon: dict[int, list[list[Any]]] = defaultdict(list)
    raid: set[int] = set()
    for template in sorted(templates, key=lambda t: as_int(t["Entry"])):
        loot_id = as_int(template.get("LootId"))
        if loot_id <= 0:
            continue
        name = str(template["Name"])
        rank = as_int(template.get("Rank"))
        for map_id in sorted(maps_of(template)):
            named = name in encounters.get(map_id, set())
            if instance_types.get(map_id) == INSTANCE_DUNGEON and (rank == RANK_BOSS or (rank >= RANK_ELITE and named)):
                for item_id in loot_items(loot_id, creature_loot, references, pools) & gear_ids:
                    row = [name, map_id]
                    if row not in dungeon[item_id]:
                        dungeon[item_id].append(row)
            elif _raid_like(map_id, rank, instance_types) and (rank == RANK_BOSS or named):
                raid |= loot_items(loot_id, creature_loot, references, pools) & gear_ids
    drops = {i: sorted(rows, key=lambda r: (r[1], r[0]))[:MAX_SOURCES_PER_ITEM] for i, rows in dungeon.items()}
    return drops, raid - set(drops)
