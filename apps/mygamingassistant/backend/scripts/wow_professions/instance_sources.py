"""Dungeon and raid drops of recipe items, which the professions' open-world sources leave out.

Reuses the item pages' finder (``scripts.wow_item_pages.finder``) so a recipe and an item
page name the same bosses with the same chances.
"""
from __future__ import annotations

import json
from collections.abc import Mapping, MutableMapping
from typing import Any

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_item_pages.finder import instance_rows, load_finder
from scripts.wow_world_map.coords import ZoneBounds

CLASSIC_DUNGEONS = WOW_DATA_DIR / "worldMap" / "classic" / "classicDungeons.json"

# instance_rows' column holding the entrance's zone (ui map id), or None.
INSTANCE_ZONE = 5


def add_instance_drops(
    recipe_sources: Mapping[str, dict[str, Any]],
    zone_bounds: list[ZoneBounds],
    zone_names: Mapping[int, str],
    shown_zones: MutableMapping[int, str],
) -> dict[int, list[Any]]:
    """Adds each recipe item's ``instance`` drop to ``recipe_sources`` and returns the instances they name.

    Every entrance zone is added to ``shown_zones`` so the page can name where the door is.
    """
    loaded = load_finder(zone_bounds, {int(i) for i in recipe_sources})
    for item, sources in recipe_sources.items():
        if found := loaded.finder.instance_drop(int(item)):
            sources["instance"] = found
    instances = instance_rows(
        json.loads(CLASSIC_DUNGEONS.read_text(encoding="utf-8")),
        loaded.map_names,
        loaded.instance_types,
        loaded.finder.instances,
    )
    for row in instances.values():
        zone = row[INSTANCE_ZONE]
        if zone is not None:
            shown_zones[int(zone)] = zone_names[int(zone)]
    return instances
