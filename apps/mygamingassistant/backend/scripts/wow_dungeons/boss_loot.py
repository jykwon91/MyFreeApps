"""What each dungeon boss drops, for the dungeon pages (``/wow-forever/dungeons/:slug``).

The bosses and their order are the Forever client's ``DungeonEncounter`` list
(already in ``classicInteriors.json``). The Forever client has no loot tables,
so a boss's loot is its cmangos classic-db loot (GPL-3.0), rolled the way the
item pages roll it (``scripts/wow_item_pages/loot_chances.py``: shared world-drop
pools left out), and kept only for items the Forever client has (``items.json``)
— never an item from Classic alone.

Pure: the build (``build.py``) passes in the dump's rows; tests feed hand-made rows.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from scripts.wow_item_pages.drops import MIN_BOSS_CHANCE
from scripts.wow_item_pages.loot_chances import as_int, table_chances

Row = Mapping[str, Any]

LOOT_COLUMNS = ["item", "chance"]

# Forever encounter name -> the cmangos creature(s) it is, where the names differ.
# An encounter of several creatures (The Lost Dwarves) gives what any of them drops.
# Encounters whose loot is a chest or an event (Ring of Law, The Seven, The Vault) have none here.
ENCOUNTER_CREATURES: Mapping[str, tuple[str, ...]] = {
    "Geilhast": ("Gelihast",),
    "The Lost Dwarves": ("Baelog", 'Eric "The Swift"', "Olaf"),
    "Kirtonos": ("Kirtonos the Herald",),
    "Ras Frostwhisperer": ("Ras Frostwhisper",),
}


def creature_names(encounter: str) -> tuple[str, ...]:
    """The cmangos creature names behind a Forever encounter (its own name unless listed above)."""
    return ENCOUNTER_CREATURES.get(encounter, (encounter,))


def encounter_names(instances: Mapping[str, Mapping[str, Any]], boss_columns: list[str]) -> dict[int, set[str]]:
    """Instance map id -> every creature name its encounters stand for (for placing unspawned bosses)."""
    name_at = boss_columns.index("name")
    out: dict[int, set[str]] = defaultdict(set)
    for map_id, interior in instances.items():
        for boss in interior["bosses"]:
            out[int(map_id)].update(creature_names(str(boss[name_at])))
    return out


def boss_loot(
    names: Iterable[str],
    map_id: int,
    templates_by_name: Mapping[str, list[Row]],
    maps_of: Callable[[Row], set[int]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    forever_items: set[int],
) -> list[list[Any]] | None:
    """[[item, percent], ...] most likely first, or None when no creature of these names is in this instance.

    Several creatures (or one name spawned twice) give the best chance any of
    them has. Items under MIN_BOSS_CHANCE and items the Forever client lacks are left out.
    """
    templates = [t for n in names for t in templates_by_name.get(n, []) if map_id in maps_of(t)]
    if not templates:
        return None
    best: dict[int, float] = {}
    for template in templates:
        for item, percent in creature_drops(template, creature_loot, references, pools, forever_items).items():
            best[item] = max(percent, best.get(item, 0.0))
    return drop_rows(best)


def creature_drops(
    template: Row,
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    forever_items: set[int],
) -> dict[int, float]:
    """Item -> percent per kill for one creature: Forever items only, MIN_BOSS_CHANCE and up."""
    loot_id = as_int(template.get("LootId"))
    if loot_id <= 0:
        return {}
    out: dict[int, float] = {}
    for item, chance in table_chances(creature_loot.get(loot_id, []), references, pools).items():
        percent = round(chance * 100.0, 1)
        if item in forever_items and percent >= MIN_BOSS_CHANCE:
            out[item] = percent
    return out


def drop_rows(drops: Mapping[int, float]) -> list[list[Any]]:
    """[[item, percent], ...] most likely first, ties by item id."""
    return [[item, percent] for item, percent in sorted(drops.items(), key=lambda kv: (-kv[1], kv[0]))]


def dungeon_loot(
    instances: Mapping[str, Mapping[str, Any]],
    boss_columns: list[str],
    dungeon_ids: set[int],
    templates_by_name: Mapping[str, list[Row]],
    maps_of: Callable[[Row], set[int]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    forever_items: set[int],
) -> dict[str, dict[str, list[list[Any]]]]:
    """Dungeon map id -> encounter id -> loot rows; an encounter with no matching creature is left out."""
    enc_at, name_at = boss_columns.index("encounter"), boss_columns.index("name")
    out: dict[str, dict[str, list[list[Any]]]] = {}
    for map_id in sorted(dungeon_ids):
        interior = instances.get(str(map_id))
        if interior is None:
            continue
        bosses: dict[str, list[list[Any]]] = {}
        for boss in interior["bosses"]:
            loot = boss_loot(
                creature_names(str(boss[name_at])), map_id, templates_by_name, maps_of,
                creature_loot, references, pools, forever_items,
            )
            if loot is not None:
                bosses[str(boss[enc_at])] = loot
        out[str(map_id)] = bosses
    return out


def loot_item_rows(
    loot: Mapping[str, Mapping[str, list[list[Any]]]],
    items: Mapping[int, list[Any]],
    columns: list[str],
    also: Iterable[int] = (),
) -> dict[str, list[Any]]:
    """Item id -> [name, slot, itemType] (Forever's ``items.json``) for every item the loot names, plus ``also``."""
    at = [columns.index(c) for c in ("name", "slot", "itemType")]
    ids = sorted({int(row[0]) for bosses in loot.values() for rows in bosses.values() for row in rows} | set(also))
    return {str(i): [items[i][a] for a in at] for i in ids}
