"""The map hierarchy (world -> continents -> zones / cities) and each map's
world bounds, from the Forever client's ``UiMap`` + ``UiMapAssignment``.

Links come from ``UiMap.ParentUiMapID`` — the same tree the in-game map's
zoom-out follows (Elwynn Forest -> Eastern Kingdoms -> Azeroth). Capital
cities hang off their continent there, not off the zone they sit in.
"""
from __future__ import annotations

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds

# World map ids a player walks on: Eastern Kingdoms, Kalimdor, and Forever's
# two island maps (Zephras Isle — the Skyborne starting island — and the
# Darkspear Islands), which the client ships as their own world maps.
CONTINENT_NAMES = {0: "Eastern Kingdoms", 1: "Kalimdor", 2991: "Zephras Isle", 2997: "Darkspear Islands"}

UI_MAP_TYPE_WORLD = "1"
UI_MAP_TYPE_CONTINENT = "2"
UI_MAP_TYPE_ZONE = "3"
# The top of the tree: the Azeroth world map.
WORLD_UI_MAP = 947
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
FOREVER_ONLY_ZONES = {
    2482,  # Mount Hyjal
    2521,  # Zephras Isle
    2524,  # Darkspear Islands
    2548,  # Riverglades
    2652,  # Shen'dralas
}

# AreaTable.FactionGroupMask -> whose territory the zone is (the colour the
# game gives a zone name: friendly / hostile / contested).
TERRITORY_BY_MASK = {"2": "alliance", "4": "horde", "0": "contested"}

# Level ranges: the client ships no zone level range (UiMap / AreaTable
# ContentTuning are unset), but every sub-area carries the level its
# exploration XP is tuned for. The range is those levels with Tukey outliers
# dropped (Dun Morogh's level-56 submarine facility, Duskwood's level-10
# river bank), clamped to the level cap.
MIN_AREAS_FOR_LEVELS = 3
TUKEY_K = 1.5
LEVEL_CAP = 60


def _quartile(values: list[int], q: float) -> float:
    """Linear-interpolated quantile of sorted ``values``."""
    pos = (len(values) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (pos - lo)


def level_range(levels: list[int]) -> tuple[int, int] | None:
    """The zone's level range from its sub-areas' exploration levels."""
    values = sorted(v for v in levels if v > 0)
    if len(values) < MIN_AREAS_FOR_LEVELS:
        return None
    q1, q3 = _quartile(values, 0.25), _quartile(values, 0.75)
    spread = q3 - q1
    kept = [v for v in values if q1 - TUKEY_K * spread <= v <= q3 + TUKEY_K * spread]
    return max(1, kept[0]), min(LEVEL_CAP, kept[-1])


def _zone_levels() -> dict[str, tuple[int, int]]:
    """Level range per zone ``AreaTable`` id, from every sub-area under it."""
    areas = sources.wago_table("AreaTable")
    children: dict[str, list[dict[str, str]]] = {}
    for area in areas:
        children.setdefault(area["ParentAreaID"], []).append(area)

    def descendants(area_id: str) -> list[dict[str, str]]:
        found: list[dict[str, str]] = []
        for child in children.get(area_id, []):
            found.append(child)
            found.extend(descendants(child["ID"]))
        return found

    ranges: dict[str, tuple[int, int]] = {}
    for area in areas:
        if area["ParentAreaID"] != "0":
            continue
        found = level_range([int(a["ExplorationLevel"]) for a in descendants(area["ID"])])
        if found:
            ranges[area["ID"]] = found
    return ranges


def _world_regions(assignments: list[dict[str, str]]) -> list[dict[str, object]]:
    """Where each continent's world rectangle is drawn on the Azeroth map."""
    regions: list[dict[str, object]] = []
    for row in sorted(assignments, key=lambda r: int(r["OrderIndex"])):
        regions.append({
            "continent": int(row["MapID"]),
            "ui": [round(float(row[k]), 4) for k in ("UiMin_0", "UiMin_1", "UiMax_0", "UiMax_1")],
            "bounds": [
                round(float(row["Region_0"]), 2),
                round(float(row["Region_3"]), 2),
                round(float(row["Region_1"]), 2),
                round(float(row["Region_4"]), 2),
            ],
        })
    return regions


def load_world() -> dict[str, object]:
    """The Azeroth world map: the top of the tree, drawing both continents."""
    ui = next(r for r in sources.wago_table("UiMap") if r["ID"] == str(WORLD_UI_MAP))
    if ui["Type"] != UI_MAP_TYPE_WORLD:
        raise ValueError(f"UiMap {WORLD_UI_MAP} is no longer the world map")
    rows = [r for r in sources.wago_table("UiMapAssignment") if r["UiMapID"] == str(WORLD_UI_MAP)]
    return {"id": WORLD_UI_MAP, "name": ui["Name_lang"], "regions": _world_regions(rows)}


def load_zones() -> tuple[list[dict[str, object]], list[ZoneBounds]]:
    """Return (zones.json entries, bounds of every non-continent map)."""
    ui_maps = {row["ID"]: row for row in sources.wago_table("UiMap")}
    areas = {row["ID"]: row for row in sources.wago_table("AreaTable")}
    levels = _zone_levels()
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
            "parent": int(ui["ParentUiMapID"]),
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
            # A new zone's faction mask and area levels aren't tuned in the
            # beta client yet (the Horde's Darkspear Islands reads
            # "contested"), so claim neither.
            entry["foreverOnly"] = True
        elif not is_continent:
            area = areas.get(row["AreaID"])
            territory = TERRITORY_BY_MASK.get(area["FactionGroupMask"]) if area else None
            if territory:
                entry["territory"] = territory
            if kind == "zone" and row["AreaID"] in levels:
                entry["levels"] = list(levels[row["AreaID"]])
        entries.append(entry)
        if not is_continent:
            bounds.append(zone)
    entries.sort(key=lambda z: (str(z["kind"]) != "continent", str(z["name"])))
    return entries, bounds
