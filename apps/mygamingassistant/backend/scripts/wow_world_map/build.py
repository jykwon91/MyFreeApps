"""Build the WoW Forever World Map static data.

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_world_map.build            # data + map art
    python -m scripts.wow_world_map.build --no-art   # data only

Writes (paths relative to ``apps/mygamingassistant/frontend``):

* ``src/games/wow-forever/data/worldMap/zones.json`` — the map tree
  (Azeroth -> continents -> zones / cities, from ``UiMap`` parent links) with
  each map's world bounds, territory and level range (Forever client tables).
* ``src/games/wow-forever/data/worldMap/mapMasks.json`` — each zone's and
  continent's outline as a bit mask, from its highlight art (hit-testing).
* ``src/games/wow-forever/data/worldMap/travel.json`` — flight paths, flight
  routes, boats and zeppelins (Forever client tables).
* ``src/games/wow-forever/data/worldMap/classic/classicServices.json`` —
  service NPCs (trainers, flight masters, inns, banks, ...). Derived from
  cmangos classic-db, so GPL-3.0 — see the LICENSE file in that folder.
* ``.../classic/classicQuests.json`` — quest givers and their quests (GPL-3.0).
* ``.../classic/classicDungeons.json`` — dungeon / raid entrances (GPL-3.0).
* ``public/wow-maps/<uiMapId>.webp`` — the in-game map art of each map
  (world, continents, zones, cities), stitched from the client's 256px tiles.
* ``public/wow-maps/highlight/<uiMapId>.webp`` — the hover highlight of each
  zone / continent on its parent map.

Deterministic for the pinned sources in ``sources.py``.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.wow_world_map import sources
from scripts.wow_world_map.dungeons import COLUMNS as DUNGEON_COLUMNS
from scripts.wow_world_map.dungeons import build_dungeons
from scripts.wow_world_map.highlights import MASK_H, MASK_W, MapHighlights
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.quests import GIVER_COLUMNS, QUEST_COLUMNS, build_quests
from scripts.wow_world_map.services import COLUMNS as SERVICE_COLUMNS
from scripts.wow_world_map.services import build_services
from scripts.wow_world_map.travel import build_travel
from scripts.wow_world_map.zones import CONTINENT_NAMES, load_world, load_zones

BACKEND_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
DATA_DIR = FRONTEND_DIR / "src" / "games" / "wow-forever" / "data" / "worldMap"
CLASSIC_DIR = DATA_DIR / "classic"
ART_DIR = FRONTEND_DIR / "public" / "wow-maps"
HIGHLIGHT_DIR = ART_DIR / "highlight"

BLIZZARD_SOURCE = {
    "publisher": "Blizzard Entertainment (World of Warcraft: Forever client data)",
    "via": "wago.tools DB2 export",
    "branch": sources.WAGO_BRANCH,
    "build": sources.WAGO_BUILD,
}


def classic_source(client_tables: str) -> dict[str, object]:
    """Provenance block for a GPL-3.0 file derived from cmangos classic-db."""
    return {
        "repo": sources.CMANGOS_REPO,
        "commit": sources.CMANGOS_COMMIT,
        "file": sources.CMANGOS_DUMP,
        "license": "GPL-3.0-or-later",
        "clientTables": {**BLIZZARD_SOURCE, "tables": client_tables},
    }


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    # One row per line keeps diffs reviewable when a pinned source moves.
    text = text.replace("],[", "],\n[").replace("},{", "},\n{")
    path.write_text(text + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever World Map data.")
    parser.add_argument("--no-art", action="store_true", help="skip the map art images")
    args = parser.parse_args()
    print(f"download cache: {sources.CACHE_DIR}")

    zones_json, zone_bounds = load_zones()
    world = load_world()
    highlights = MapHighlights()
    map_ids = [int(str(world["id"]))] + [int(str(z["id"])) for z in zones_json]
    outlined = [m for m in map_ids if highlights.has(m)]
    # A zone's highlight is a filled glow — its outline mask. A continent's is
    # only its coastline, so the page hit-tests a continent as the union of
    # its zones and ships no mask for it.
    masked = [int(str(z["id"])) for z in zones_json if z["kind"] == "zone" and highlights.has(int(str(z["id"])))]
    for zone in zones_json:
        if highlights.has(int(str(zone["id"]))):
            zone["highlight"] = True
    write_json(DATA_DIR / "zones.json", {
        "source": {**BLIZZARD_SOURCE, "tables": "UiMap, UiMapAssignment, UiMapArt, AreaTable"},
        "continents": {str(k): v for k, v in CONTINENT_NAMES.items()},
        "world": world,
        "zones": zones_json,
    })
    print(f"zones: {len(zones_json)}")
    write_json(DATA_DIR / "mapMasks.json", {
        "source": {**BLIZZARD_SOURCE, "tables": "UiMapXMapArt, UiMapArt (highlight textures)"},
        "width": MASK_W,
        "height": MASK_H,
        "masks": {str(m): highlights.mask(m) for m in masked},
    })
    print(f"zone outlines: {len(masked)}")

    art = WorldMapArt()
    if not args.no_art:
        written = sum(art.render(m, ART_DIR) for m in map_ids)
        for m in outlined:
            highlights.render(m, HIGHLIGHT_DIR)
        print(f"map art: {written} images, {len(outlined)} highlights")

    travel = build_travel(zone_bounds, art, set(CONTINENT_NAMES))
    write_json(DATA_DIR / "travel.json", {
        "source": {
            **BLIZZARD_SOURCE,
            "tables": "TaxiNodes, TaxiPath, TaxiPathNode, WorldMapOverlay, AreaTable",
        },
        **travel,
    })
    print(f"flight nodes: {len(travel['nodes'])}, routes: {len(travel['edges'])}, "  # type: ignore[arg-type]
          f"transports: {len(travel['transports'])}")  # type: ignore[arg-type]

    rows, counts = build_services(zone_bounds, art)
    write_json(CLASSIC_DIR / "classicServices.json", {
        "source": classic_source("FactionTemplate, UiMapAssignment, WorldMapOverlay, AreaTable"),
        "columns": SERVICE_COLUMNS,
        "rows": rows,
    })
    print(f"services: {len(rows)}")
    for key, n in sorted(counts.items()):
        print(f"  {key}: {n}")

    quest_rows, giver_rows = build_quests(zone_bounds, art)
    write_json(CLASSIC_DIR / "classicQuests.json", {
        "source": classic_source("FactionTemplate, UiMapAssignment, WorldMapOverlay, AreaTable"),
        "questColumns": QUEST_COLUMNS,
        "quests": quest_rows,
        "giverColumns": GIVER_COLUMNS,
        "givers": giver_rows,
    })
    print(f"quests: {len(quest_rows)}, quest givers: {len(giver_rows)}")

    dungeon_rows = build_dungeons(zone_bounds, art)
    write_json(CLASSIC_DIR / "classicDungeons.json", {
        "source": classic_source("AreaTrigger, Map, LFGDungeons, UiMapAssignment, WorldMapOverlay, AreaTable"),
        "columns": DUNGEON_COLUMNS,
        "rows": dungeon_rows,
    })
    print(f"dungeon / raid entrances: {len(dungeon_rows)}")


if __name__ == "__main__":
    main()
