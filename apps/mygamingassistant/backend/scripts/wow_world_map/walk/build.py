"""Build one map's walk graph file end to end: navmesh -> graph -> export."""
from __future__ import annotations

import time
from pathlib import Path

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import clusters, export, walk_graph
from scripts.wow_world_map.walk.links import map_links
from scripts.wow_world_map.walk.navbuild import build_navmesh


def wdt_ids() -> dict[int, int]:
    return {int(r["ID"]): int(r["WdtFileDataID"]) for r in sources.wago_table("Map")}


def build_walk(map_id: int, travel: dict, out_dir: Path) -> Path:
    start = time.time()
    print(f"walk graph, map {map_id}")
    nav_dir, scene = build_navmesh(map_id, wdt_ids()[map_id])
    polys = walk_graph.load_polys(nav_dir)
    buildings = [b for b, _ in scene.buildings]
    labels, names = walk_graph.label_polys(polys, list(scene.tiles.values()), buildings, walk_graph.AreaNames())
    hubs = export.travel_hubs(travel, map_id)
    graph = clusters.cluster(polys, labels, names, map_links(map_id), [h.anchor for h in hubs])
    hubs, hub_nodes, matrix = export.hub_matrix(graph, hubs)
    path = out_dir / f"{map_id}.walk"
    size = export.write_walk(path, map_id, graph, hubs, hub_nodes, matrix)
    print(f"  {path.name}: {size / 1e6:.1f} MB, {len(hubs)} hubs, {time.time() - start:.0f} s")
    return path
