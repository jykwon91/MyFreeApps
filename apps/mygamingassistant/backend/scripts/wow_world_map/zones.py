"""Zone / city / continent maps and their world bounds, from the Forever client."""
from __future__ import annotations

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds

# World map ids a player walks on: Eastern Kingdoms, Kalimdor, and Forever's
# Zephras Isle (its own world map, the Skyborne starting island).
CONTINENT_NAMES = {0: "Eastern Kingdoms", 1: "Kalimdor", 2991: "Zephras Isle"}

UI_MAP_TYPE_CONTINENT = "2"
UI_MAP_TYPE_ZONE = "3"
# Duplicate / unused map variants: 1463 + 1464 are parent-less copies of the
# continent maps, 2665 a parent-less copy of Zephras Isle (2521).
SKIPPED_UI_MAPS = {"1463", "1464", "2665"}

CAPITAL_FACTION = {
    1453: "A",  # Stormwind City
    1455: "A",  # Ironforge
    1457: "A",  # Darnassus
    1454: "H",  # Orgrimmar
    1456: "H",  # Thunder Bluff
    1458: "H",  # Undercity
}

# Zones that exist only in WoW Forever (not in the 1.12 data cmangos covers):
# nothing from the Classic seed can be placed in them, so the page says
# "not mapped yet" instead of routing the player to a far-off Classic NPC.
FOREVER_ONLY_ZONES = {2482, 2521, 2548, 2652}  # Mount Hyjal, Zephras Isle, Riverglades, Shen'dralas


def load_zones() -> tuple[list[dict[str, object]], list[ZoneBounds]]:
    """Return (zones.json entries, bounds of every non-continent map)."""
    ui_maps = {row["ID"]: row for row in sources.wago_table("UiMap")}
    entries: list[dict[str, object]] = []
    bounds: list[ZoneBounds] = []
    for row in sources.wago_table("UiMapAssignment"):
        ui_id = row["UiMapID"]
        ui = ui_maps.get(ui_id)
        map_id = int(row["MapID"])
        if ui is None or ui_id in SKIPPED_UI_MAPS or map_id not in CONTINENT_NAMES:
            continue
        if ui["Type"] not in (UI_MAP_TYPE_CONTINENT, UI_MAP_TYPE_ZONE):
            continue
        zone = ZoneBounds(
            ui_map_id=int(ui_id),
            name=ui["Name_lang"],
            continent=map_id,
            min_x=float(row["Region_0"]),
            max_x=float(row["Region_3"]),
            min_y=float(row["Region_1"]),
            max_y=float(row["Region_4"]),
            ui_min_x=float(row["UiMin_0"]),
            ui_min_y=float(row["UiMin_1"]),
            ui_max_x=float(row["UiMax_0"]),
            ui_max_y=float(row["UiMax_1"]),
            nested=int(ui_id) in CAPITAL_FACTION,
        )
        if (zone.ui_min_x, zone.ui_min_y, zone.ui_max_x, zone.ui_max_y) != (0, 0, 1, 1):
            raise ValueError(f"{zone.name}: partial-map UiMapAssignment is not supported")
        is_continent = ui["Type"] == UI_MAP_TYPE_CONTINENT
        kind = "zone"
        if is_continent:
            kind = "continent"
        elif zone.ui_map_id in CAPITAL_FACTION:
            kind = "city"
        entry: dict[str, object] = {
            "id": zone.ui_map_id,
            "name": zone.name,
            "kind": kind,
            "continent": map_id,
            "bounds": [
                round(zone.min_x, 2),
                round(zone.max_x, 2),
                round(zone.min_y, 2),
                round(zone.max_y, 2),
            ],
        }
        if zone.ui_map_id in CAPITAL_FACTION:
            entry["faction"] = CAPITAL_FACTION[zone.ui_map_id]
        if zone.ui_map_id in FOREVER_ONLY_ZONES:
            entry["foreverOnly"] = True
        entries.append(entry)
        if not is_continent:
            bounds.append(zone)
    entries.sort(key=lambda z: (str(z["kind"]) != "continent", str(z["name"])))
    return entries, bounds
