"""Named buildings and areas for the World Map's place search: ``areas.json``.

Towns on the page come from the sub-zones its NPCs stand in, so a place no
service NPC stands in (an inn's tavern room, a keep, a bay) can't be typed.
The walk graphs already know them: every walkable patch carries the name of
the area or building room it's in (``walk_graph`` — AreaTable sub-zones
outside, WMOAreaTable rooms inside). This reads the continent ``.walk``
files and writes one row per name: where on the zone map it is (the patch
nearest the middle of the place, so the spot is on its floor) and whether
it's indoors. Places with no dry ground (open sea) are left out.

Run after the walk graphs (``build`` does); it only reads ``public/wow-walk``.
"""
from __future__ import annotations

import gzip
import json
import struct
from pathlib import Path

import numpy as np

from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import place

COLUMNS = ["name", "zone", "x", "y", "z", "indoor"]

HEADER = struct.Struct("<4sHHIIII")


def read_walk_labels(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[list]]:
    """``(positions (n, 3) world yards, label index (n,), water (n,), labels)`` of a ``.walk`` file."""
    raw = gzip.decompress(path.read_bytes())
    _, _, _, n, _, _, json_bytes = HEADER.unpack_from(raw, 0)
    off = HEADER.size
    xyz = np.frombuffer(raw, "<i2", 3 * n, off).reshape(3, n).T.astype(float)
    label = np.frombuffer(raw, "<u2", n, off + 6 * n)
    water = (np.frombuffer(raw, "<u1", n, off + 8 * n) & 1).astype(bool)
    labels = json.loads(raw[len(raw) - json_bytes:])["labels"]
    return xyz, label, water, labels


def build_areas(
    walk_dir: Path, continents: list[int], zones: list[ZoneBounds], art: WorldMapArt
) -> list[list[object]]:
    zone_names = {z.name for z in zones}
    best: dict[tuple[str, int], tuple[int, list[object]]] = {}
    for continent in continents:
        path = walk_dir / f"{continent}.walk"
        if not path.exists():
            print(f"  no {path.name} — skipping its areas")
            continue
        xyz, label, water, labels = read_walk_labels(path)
        # One place per (name, zone); its indoor and outdoor labels are the same place.
        by_place: dict[tuple[str, str], list[int]] = {}
        for i, (name, zone, _indoor, _city) in enumerate(labels):
            if name and name != zone and name not in zone_names:
                by_place.setdefault((name, zone), []).append(i)
        for (name, zone), ids in sorted(by_place.items()):
            # Only ground you can stand on: a sea or a river with no shore isn't somewhere to go.
            nodes = np.flatnonzero(np.isin(label, ids) & ~water)
            if not len(nodes):
                continue
            indoor_ids = [i for i in ids if labels[i][2]]
            indoor = np.flatnonzero(np.isin(label, indoor_ids) & ~water)
            # A building's spot is inside it, even when its area takes in the yard.
            pts = xyz[indoor] if len(indoor) else xyz[nodes]
            mid = pts[np.argmin(np.linalg.norm(pts[:, :2] - pts[:, :2].mean(axis=0), axis=1))]
            spot = place(zones, art, continent, float(mid[0]), float(mid[1]), zone_hint=zone)
            if spot is None:
                continue
            row = [name, spot.zone.ui_map_id, round(spot.x, 1), round(spot.y, 1), int(mid[2]), int(bool(len(indoor)))]
            # The same name twice on one map (a lake split between two zones' labels): keep the bigger.
            key = (name, spot.zone.ui_map_id)
            if key not in best or len(nodes) > best[key][0]:
                best[key] = (len(nodes), row)
    rows = [row for _, row in best.values()]
    rows.sort(key=lambda r: (r[1], r[0]))
    return rows


def main() -> None:
    """Rebuild ``areas.json`` alone from the committed walk graphs."""
    from scripts.wow_world_map.build import write_areas
    from scripts.wow_world_map.zones import load_zones

    _, zone_bounds = load_zones()
    write_areas(zone_bounds, WorldMapArt())


if __name__ == "__main__":
    main()
