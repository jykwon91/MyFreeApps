"""Build the World Map satellite images: each zone's ground from the client's minimap.

    python -m scripts.wow_satellite.build              # every zone + outdoor capital
    python -m scripts.wow_satellite.build 1429 1411    # just these maps

Run from ``backend/`` after ``scripts.wow_world_map.build``. For each
continent it reads the WDT (``Map.WdtFileDataID``), takes the minimap
texture of every ADT from its ``MAID`` chunk, downloads the ones under each
zone from wago.tools (the pinned client build, ``sources.py``; cached on disk)
and writes ``<download cache>/<build>/satellite/<uiMapId>.webp``
(``render.py``). Then ``scripts.wow_satellite.publish`` uploads them. Images
are never committed; game art © Blizzard Entertainment.

Writes ``frontend/src/games/wow-forever/data/worldMap/satellite.json`` — the
build and the maps that have an image — which the page reads to offer the
Satellite toggle. A partial run (map ids given) leaves it untouched.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Final

from scripts.wow_satellite.grid import tiles_covering, zone_crop
from scripts.wow_satellite.render import OUT_HEIGHT, OUT_WIDTH, SOURCE_TILE_PX, render_zone, to_webp
from scripts.wow_satellite.wdt import minimap_file_ids
from scripts.wow_world_map import sources
from scripts.wow_world_map.build import BLIZZARD_SOURCE, DATA_DIR, write_json
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.walk.client_files import client_file, prefetch
from scripts.wow_world_map.zones import load_zones

MANIFEST: Final = DATA_DIR / "satellite.json"
OUT_DIR: Final = sources.CACHE_DIR / sources.WAGO_BUILD / "satellite"
# Ironforge and Undercity are underground: the terrain minimap shows only the
# mountain / ruins above them (their own minimaps are building textures).
INDOOR_CITIES: Final = frozenset({1455, 1458})


def wanted(bounds: ZoneBounds) -> bool:
    """Zones and outdoor capitals; continents and the world stay drawn-only."""
    return bounds.ui_map_id not in INDOOR_CITIES


def continent_wdts() -> dict[int, int]:
    """``{Map.ID: WDT FileDataID}`` for every continent with zones."""
    return {int(r["ID"]): int(r["WdtFileDataID"]) for r in sources.wago_table("Map") if r["WdtFileDataID"] not in ("", "0")}


def write_manifest(map_ids: list[int]) -> None:
    write_json(MANIFEST, {
        "source": {**BLIZZARD_SOURCE, "tables": "Map, WDT MAID (minimap textures), UiMapAssignment"},
        "build": sources.WAGO_BUILD,
        "width": OUT_WIDTH,
        "height": OUT_HEIGHT,
        "maps": sorted(map_ids),
    })


def build(only: set[int] | None, out_dir: Path) -> list[int]:
    _, zone_bounds = load_zones()
    zones = [z for z in zone_bounds if wanted(z) and (only is None or z.ui_map_id in only)]
    wdts = continent_wdts()
    minimaps: dict[int, dict[tuple[int, int], int]] = {}
    for continent in sorted({z.continent for z in zones}):
        minimaps[continent] = minimap_file_ids(client_file(wdts[continent]))
        print(f"continent {continent}: {len(minimaps[continent])} minimap tiles in the WDT", flush=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[int] = []
    total = 0
    for zone in sorted(zones, key=lambda z: z.ui_map_id):
        cells = minimaps[zone.continent]
        prefetch(cells[c] for c in tiles_covering(zone_crop(zone, SOURCE_TILE_PX), SOURCE_TILE_PX) if c in cells)
        image = render_zone(zone, cells, client_file)
        if image is None:
            print(f"  {zone.ui_map_id} {zone.name}: no minimap tiles - skipped", flush=True)
            continue
        body = to_webp(image)
        (out_dir / f"{zone.ui_map_id}.webp").write_bytes(body)
        written.append(zone.ui_map_id)
        total += len(body)
        print(f"  {zone.ui_map_id} {zone.name}: {len(body) // 1024} KB", flush=True)
    print(f"satellite: {len(written)} images, {total / 1024 / 1024:.1f} MB -> {out_dir}")
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the World Map satellite images.")
    parser.add_argument("maps", nargs="*", type=int, help="only these UiMap ids (leaves satellite.json as it is)")
    args = parser.parse_args()
    print(f"download cache: {sources.CACHE_DIR}")
    written = build(set(args.maps) or None, OUT_DIR)
    if not args.maps:
        write_manifest(written)
        print(f"wrote {MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
