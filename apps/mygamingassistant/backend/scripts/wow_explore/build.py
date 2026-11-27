"""Build the MGA Explorer addon's data: every area the Legacy "Explorer" challenge counts.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_explore.build

Reads the Forever client's Achievement, CriteriaTree, Criteria,
WorldMapOverlay and UiMapXMapArt tables (wago.tools ``wowf`` with hotfixes)
plus the World Map's committed ``zones.json`` (continents) and ``areas.json``
(spots on the ground), so it runs after the World Map build. Writes
``data/explore/explore.json``; the addon's ``Data.lua`` is generated from it by
``npx vitest run src/__tests__/wowExplorerAddon.test.ts -u`` (frontend). The run
stops when the tables no longer match what the addon assumes (see
``explore.py``).

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from scripts.wow_explore.explore import EXPLORE_AZEROTH, build_continents
from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

EXPLORE_PATH = WOW_DATA_DIR / "explore" / "explore.json"
WORLD_MAP_DIR = WOW_DATA_DIR / "worldMap"
EXPLORE_TABLES = ("Achievement", "CriteriaTree", "Criteria", "WorldMapOverlay", "UiMapXMapArt")


def zone_continents(zones_path: Path) -> dict[int, int]:
    """Zone map id -> continent (0 Eastern Kingdoms, 1 Kalimdor), from the World Map's zones.json."""
    doc = json.loads(zones_path.read_text(encoding="utf-8"))
    return {int(z["id"]): int(z["continent"]) for z in doc["zones"]}


def ground_spots(areas_path: Path) -> dict[tuple[str, int], tuple[float, float]]:
    """(area name, zone map id) -> the World Map's spot for it, in percent of the zone map."""
    doc = json.loads(areas_path.read_text(encoding="utf-8"))
    columns = doc["columns"]
    name, zone, x, y = (columns.index(c) for c in ("name", "zone", "x", "y"))
    return {(row[name], int(row[zone])): (float(row[x]), float(row[y])) for row in doc["rows"]}


def _compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def explore_json(doc: Mapping[str, Any]) -> str:
    """The data with one zone per line, so a refresh diff names the zones that changed."""
    parts = [f"{_compact(k)}:{_compact(v)}" for k, v in doc.items() if k != "continents"]
    continents = []
    for continent in doc["continents"]:
        head = _compact({k: v for k, v in continent.items() if k != "zones"})[:-1]
        zones = ",\n".join(_compact(z) for z in continent["zones"])
        continents.append(f'{head},"zones":[\n{zones}\n]}}')
    parts.append('"continents":[\n' + ",\n".join(continents) + "\n]")
    return "{" + ",\n".join(parts) + "}\n"


def main() -> None:
    tables = {t: wago_table(t, hotfixes=True) for t in EXPLORE_TABLES}
    title, continents = build_continents(
        tables,
        zone_continents(WORLD_MAP_DIR / "zones.json"),
        ground_spots(WORLD_MAP_DIR / "areas.json"),
    )
    EXPLORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    EXPLORE_PATH.write_text(explore_json({
        "source": f"wago.tools DB2 {WAGO_BRANCH} {WAGO_BUILD} with hotfixes ({', '.join(EXPLORE_TABLES)}); spots from the World Map's areas.json",
        "attribution": "Game data from the WoW Forever client. © Blizzard Entertainment.",
        "achievement": {"id": EXPLORE_AZEROTH, "name": title},
        "continents": [c.as_doc() for c in continents],
    }), encoding="utf-8")
    for c in continents:
        areas = [a for z in c.zones for a in z.areas]
        on_ground = sum(1 for a in areas if a.spot == "ground")
        print(f"{c.name}: {len(c.zones)} zones, {len(areas)} areas ({on_ground} spots on the ground, {len(areas) - on_ground} from the map overlay)")
    print(f"-> {EXPLORE_PATH}")


if __name__ == "__main__":
    main()
