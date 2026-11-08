"""Which dungeon a quest's people, objects and items belong to (cmangos classic-db, GPL-3.0).

A dungeon quest is one Classic files under the dungeon (``ZoneOrSort``), or one
with an objective that only happens inside it: a creature or object that only
spawns on the instance map, or an item that only drops there. These lookups
answer "only inside which dungeon?" — left out when it's also found anywhere else.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping

from scripts.wow_item_pages.loot_chances import Row, as_int

GO_TYPE_CHEST = 3  # gameobject_template.type: a chest; data1 is its loot id


def dungeon_areas(names: Mapping[int, str], areas: Iterable[Mapping[str, str]], maps: Iterable[Mapping[str, str]]) -> dict[int, int]:
    """Area id -> instance map id for every area Classic may file a dungeon's quests under.

    The client has more than one: the instance map's own area (``Map.AreaTableID``)
    and the zone-level area of the same name that 1.12 filed quests under
    (Razorfen Kraul 1717, Gnomeregan 133, Zul'Farrak 978, ...).
    """
    wanted = {n.lower(): m for m, n in names.items()} | {f"the {n.lower()}": m for m, n in names.items()}
    out: dict[int, int] = {}
    for area in areas:
        instance = wanted.get(area["AreaName_lang"].strip().lower())
        if instance is not None:
            out[int(area["ID"])] = instance
    for row in maps:
        area_id = int(row["AreaTableID"])
        if int(row["ID"]) in names and area_id:
            out[area_id] = int(row["ID"])
    return out


def _single(places: Mapping[int, set[int | None]]) -> dict[int, int]:
    out: dict[int, int] = {}
    for key, on in places.items():
        if len(on) == 1:
            (only,) = on
            if only is not None:
                out[key] = only
    return out


def only_on(spawns: Iterable[Row], instances: set[int]) -> dict[int, int]:
    """Template entry -> the one instance map every spawn of it is on (``creature`` / ``gameobject`` rows)."""
    maps: dict[int, set[int | None]] = defaultdict(set)
    for spawn in spawns:
        map_id = as_int(spawn["map"])
        maps[as_int(spawn["id"])].add(map_id if map_id in instances else None)
    return _single(maps)


def _add_drops(
    places: dict[int, set[int | None]],
    templates: Iterable[Row],
    entry_key: str,
    loot_key: str,
    loot: Iterable[Row],
    inside: Mapping[int, int],
) -> None:
    holders: dict[int, list[int]] = defaultdict(list)
    for template in templates:
        loot_id = as_int(template[loot_key])
        if loot_id:
            holders[loot_id].append(as_int(template[entry_key]))
    for row in loot:
        if as_int(row["mincountOrRef"]) < 0:  # a reference table: world drops, not quest items
            continue
        for holder in holders.get(as_int(row["entry"]), []):
            places[as_int(row["item"])].add(inside.get(holder))


def item_dungeons(
    creature_templates: Iterable[Row],
    gameobject_templates: Iterable[Row],
    creature_loot: Iterable[Row],
    gameobject_loot: Iterable[Row],
    creature_inside: Mapping[int, int],
    gameobject_inside: Mapping[int, int],
) -> dict[int, int]:
    """Item -> the one dungeon every creature and chest that drops it is inside.

    Only loot rows that name the item itself count (quest items always do);
    an item with no drop at all (handed over, made by a spell) is inside nowhere.
    """
    places: dict[int, set[int | None]] = defaultdict(set)
    _add_drops(places, creature_templates, "Entry", "LootId", creature_loot, creature_inside)
    chests = [t for t in gameobject_templates if as_int(t["type"]) == GO_TYPE_CHEST]
    _add_drops(places, chests, "entry", "data1", gameobject_loot, gameobject_inside)
    return _single(places)
