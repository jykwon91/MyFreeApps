"""Navmesh polygons for a whole map: gather geometry per terrain tile, then
run the Recast builder (``navmesh.mjs``) over all tiles in parallel.

Both stages cache their output per client build under the download cache,
so re-running the generator only rebuilds what's missing. Delete
``<cache>/<build>/walk/`` to rebuild from scratch.
"""
from __future__ import annotations

import math
import os
import shutil
import subprocess
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import models, terrain
from scripts.wow_world_map.walk.client_files import client_file, prefetch
from scripts.wow_world_map.walk.geometry import MARGIN, Box, m2_mesh, mesh_box, tile_soup
from scripts.wow_world_map.walk.terrain import TILE_SIZE, Placement, TileFiles
from scripts.wow_world_map.walk.transform import placement_matrix

NAVMESH_SCRIPT = Path(__file__).with_name("navmesh.mjs")
WORKERS = max(1, min(24, (os.cpu_count() or 4) - 2))


def work_dir(map_id: int) -> Path:
    return sources.CACHE_DIR / sources.WAGO_BUILD / "walk" / str(map_id)


@dataclass
class MapScene:
    tiles: dict[tuple[int, int], TileFiles]
    buildings: list[tuple[Placement, Box]]
    props: list[tuple[Placement, Box]]


def _tiles_touching(box: Box) -> list[tuple[int, int]]:
    """Terrain tiles (row, col) whose area plus margin a box touches."""
    rows = range(
        max(0, math.floor((terrain.MAP_ORIGIN - box.x1 - MARGIN) / TILE_SIZE)),
        min(63, math.floor((terrain.MAP_ORIGIN - box.x0 + MARGIN) / TILE_SIZE)) + 1,
    )
    cols = range(
        max(0, math.floor((terrain.MAP_ORIGIN - box.y1 - MARGIN) / TILE_SIZE)),
        min(63, math.floor((terrain.MAP_ORIGIN - box.y0 + MARGIN) / TILE_SIZE)) + 1,
    )
    return [(r, c) for r in rows for c in cols]


def _instance_tiles(building: Placement) -> dict[tuple[int, int], TileFiles]:
    """Tiles with no terrain covering a WMO-only map's one building."""
    assert building.extents is not None
    return {k: TileFiles(k[0], k[1], 0, 0) for k in _tiles_touching(Box(*building.extents))}


def load_scene(wdt_file_data_id: int) -> MapScene:
    tiles = {(t.row, t.col): t for t in terrain.map_tiles(wdt_file_data_id)}
    prefetch([t.root for t in tiles.values()] + [t.obj0 for t in tiles.values()])
    buildings: dict[int, Placement] = {}
    props: dict[int, Placement] = {}
    for tile in tiles.values():
        b, p = terrain.placements(client_file(tile.obj0))
        buildings.update((x.unique_id, x) for x in b)
        props.update((x.unique_id, x) for x in p)
    if not tiles:
        # A dungeon: no terrain, one building placed by the WDT itself.
        building = terrain.global_wmo(wdt_file_data_id)
        if building is None:
            raise ValueError(f"WDT {wdt_file_data_id} has neither terrain tiles nor a global building")
        buildings[building.unique_id] = building
        tiles = _instance_tiles(building)
    wmo_ids = {b.file_data_id for b in buildings.values()}
    prefetch(wmo_ids)
    prefetch(f for w in wmo_ids for f in models.wmo_group_file_ids(w) + models.wmo_doodad_file_ids(w))
    prefetch(p.file_data_id for p in props.values())
    prop_boxes = []
    for p in props.values():
        box = mesh_box(placement_matrix(p), m2_mesh(p.file_data_id))
        if box is not None:
            prop_boxes.append((p, box))
    building_boxes = [(b, Box(*b.extents)) for b in buildings.values() if b.extents]
    print(f"  {len(tiles)} tiles, {len(building_boxes)} buildings, {len(prop_boxes)} solid props")
    return MapScene(tiles, building_boxes, prop_boxes)


_SCENE: MapScene | None = None
_BY_TILE: dict[tuple[int, int], tuple[list, list]] = {}


def _init_worker(scene: MapScene) -> None:
    global _SCENE
    _SCENE = scene
    by_tile: dict[tuple[int, int], tuple[list, list]] = defaultdict(lambda: ([], []))
    for item in scene.buildings:
        for key in _tiles_touching(item[1]):
            by_tile[key][0].append(item)
    for item in scene.props:
        for key in _tiles_touching(item[1]):
            by_tile[key][1].append(item)
    _BY_TILE.update(by_tile)


def _geometry_job(args: tuple[tuple[int, int], str]) -> int:
    key, out = args
    assert _SCENE is not None
    tile = _SCENE.tiles[key]
    buildings, props = _BY_TILE.get(key, ([], []))
    soup = tile_soup(tile, _SCENE.tiles, buildings, props)
    from scripts.wow_world_map.walk.geometry import tile_box
    return soup.write(Path(out), tile_box(tile))


def build_navmesh(map_id: int, wdt_file_data_id: int) -> tuple[Path, MapScene]:
    """Build (or reuse) every tile's navmesh polygons; returns the nav dir and the scene."""
    root = work_dir(map_id)
    geo_dir, nav_dir = root / "geometry", root / "nav"
    scene = load_scene(wdt_file_data_id)
    todo = [(k, str(geo_dir / f"{k[0]}_{k[1]}.bin")) for k in scene.tiles
            if not (geo_dir / f"{k[0]}_{k[1]}.bin").exists()]
    if todo:
        print(f"  geometry: {len(todo)} tiles on {WORKERS} workers")
        with ProcessPoolExecutor(WORKERS, initializer=_init_worker, initargs=(scene,)) as pool:
            for _ in pool.map(_geometry_job, todo, chunksize=4):
                pass
    pending = sorted(str(geo_dir / f"{r}_{c}.bin") for r, c in scene.tiles
                     if not (nav_dir / f"{r}_{c}.nav").exists())
    if pending:
        print(f"  navmesh: {len(pending)} tiles on {WORKERS} workers")
        _run_node(pending, nav_dir)
    return nav_dir, scene


def _run_node(files: list[str], nav_dir: Path) -> None:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node is required to build the navmesh (npm ci at the repo root first)")
    batches = [files[i::WORKERS] for i in range(WORKERS)]
    procs = [
        subprocess.Popen([node, str(NAVMESH_SCRIPT), str(nav_dir), *batch], stdout=subprocess.DEVNULL)
        for batch in batches if batch
    ]
    failed = [p.args for p in procs if p.wait() != 0]
    if failed:
        raise RuntimeError(f"navmesh build failed for {len(failed)} batches")
