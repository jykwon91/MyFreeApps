"""WoW Forever World Map walk graph generator — tile joins, hub snapping,
lifts / portals, clustering and the ``.walk`` file layout.

All inputs are synthetic: the real ones come from the game client and take
minutes to build (``python -m scripts.wow_world_map.walk``).
"""
from __future__ import annotations

import gzip
import json
import struct
from pathlib import Path

import numpy as np
import pytest

from scripts.wow_world_map import sources
from scripts.wow_world_map.walk import links
from scripts.wow_world_map.walk.clusters import (
    DOCK_HEADROOM,
    Anchor,
    WalkGraph,
    cluster,
    components,
    snap_hub,
)
from scripts.wow_world_map.walk.export import UNREACHABLE, Hub, hub_matrix, write_walk
from scripts.wow_world_map.walk.floors import Floors, Triangles, floor_under
from scripts.wow_world_map.walk.links import EDGE_LIFT, EDGE_PORTAL, PORTAL_COST_YARDS
from scripts.wow_world_map.walk.navfile import BORDER_FLAG, NULL_INDEX
from scripts.wow_world_map.walk.walk_graph import (
    CELLS,
    AreaNames,
    Label,
    PolyGraph,
    load_polys,
)

NVP = 6


# --- tile border joins ------------------------------------------------------

def _quad_part(sx: int, border_side: int, border_edge: int, by: float) -> bytes:
    """One Recast tile holding a single square polygon with one edge on a tile border.

    Vertices go (0,0) -> (0,256) -> (256,256) -> (256,0) in cells (x east, z
    south), so edge 0 is the west border and edge 2 the east one.
    """
    cells = [(0, 0, 0), (0, 0, CELLS), (CELLS, 0, CELLS), (CELLS, 0, 0)]
    verts = [0, 1, 2, 3] + [NULL_INDEX] * (NVP - 4)
    neis = [NULL_INDEX] * NVP
    neis[border_edge] = BORDER_FLAG | border_side
    return b"".join([
        struct.pack("<2H3f2I", sx, 0, sx * CELLS * 0.5, by, 0.0, len(cells), 1),
        struct.pack(f"<{len(cells) * 3}H", *[c for v in cells for c in v]),
        struct.pack(f"<{NVP * 2}H", *verts, *neis),
        bytes([0]),
    ])


def _write_nav(path: Path, parts: list[bytes]) -> None:
    path.write_bytes(b"MGAN" + struct.pack("<2i2f2I", 0, 0, 0.5, 0.25, NVP, len(parts)) + b"".join(parts))


def _neighbours(polys: PolyGraph, p: int) -> list[int]:
    return polys.indices[polys.indptr[p]:polys.indptr[p + 1]].tolist()


def test_polygons_on_either_side_of_a_tile_border_are_joined(tmp_path: Path) -> None:
    # Subtile 0's east edge (side 2) meets subtile 1's west edge (side 0).
    _write_nav(tmp_path / "0_0.nav", [_quad_part(0, 2, 2, by=10.0), _quad_part(1, 0, 0, by=10.0)])
    polys = load_polys(tmp_path)
    assert len(polys) == 2
    assert _neighbours(polys, 0) == [1]
    assert _neighbours(polys, 1) == [0]


def test_a_border_with_a_ledge_is_not_joined(tmp_path: Path) -> None:
    _write_nav(tmp_path / "0_0.nav", [_quad_part(0, 2, 2, by=10.0), _quad_part(1, 0, 0, by=13.0)])
    polys = load_polys(tmp_path)
    assert _neighbours(polys, 0) == []


# --- hub snapping -----------------------------------------------------------

def _comp(position: np.ndarray, edges: list[tuple[int, int]]) -> tuple[np.ndarray, np.ndarray]:
    n = len(position)
    extra: dict[int, list[int]] = {}
    for a, b in edges:
        extra.setdefault(a, []).append(b)
        extra.setdefault(b, []).append(a)
    comp = np.array(components([0] * (n + 1), [], n, extra))
    return comp, np.bincount(comp).astype(float)


def test_a_hub_snaps_to_the_big_ground_not_a_sealed_room_next_to_it() -> None:
    # 0 is a sealed hall right under the trigger; 1-3 is the city around it.
    position = np.array([[0, 0, 0], [20, 0, 0], [40, 0, 0], [60, 0, 0]], dtype=float)
    water = np.zeros(4, dtype=bool)
    comp, size = _comp(position, [(1, 2), (2, 3)])
    assert snap_hub(position, water, comp, size, Anchor(0, 0, 0)) == 1


def test_a_hub_with_no_ground_near_it_is_off_the_graph() -> None:
    position = np.array([[0, 0, 0]], dtype=float)
    comp, size = _comp(position, [])
    assert snap_hub(position, np.zeros(1, dtype=bool), comp, size, Anchor(500, 500, 0)) is None


def test_a_dock_takes_the_pier_above_the_boat_not_the_sea_or_a_hilltop() -> None:
    # A boat at sea level: the sea (water), the pier 8 yd up, the beach
    # further off, and a cliff top above any pier.
    position = np.array([
        [0, 0, -1],  # sea under the boat
        [15, 0, 8],  # pier
        [35, 0, 2],  # beach
        [10, 5, DOCK_HEADROOM + 5],  # cliff top
    ], dtype=float)
    water = np.array([True, False, False, False])
    comp, size = _comp(position, [(0, 1), (1, 2), (2, 3)])
    assert snap_hub(position, water, comp, size, Anchor(0, 0, 0, dock=True)) == 1


def test_a_zeppelin_dock_takes_the_tower_top_under_it() -> None:
    # The zeppelin hovers ~17 yd over its platform; the ground is 40 yd lower.
    position = np.array([[5, 0, 83], [12, 0, 43], [30, 0, 43]], dtype=float)
    water = np.zeros(3, dtype=bool)
    comp, size = _comp(position, [(0, 1), (1, 2)])
    assert snap_hub(position, water, comp, size, Anchor(0, 0, 100, dock=True)) == 0


# --- lifts and portals ------------------------------------------------------

def _fake_wago(monkeypatch: pytest.MonkeyPatch, tables: dict[str, list[dict[str, str]]]) -> None:
    monkeypatch.setattr(sources, "wago_table", lambda name, **_: tables[name])


def _frames(transport: int, moves: list[tuple[int, float, float, float]]) -> list[dict[str, str]]:
    return [
        {"TransportID": str(transport), "TimeIndex": str(t), "Pos_0": str(x), "Pos_1": str(y), "Pos_2": str(z)}
        for t, x, y, z in moves
    ]


def test_a_lift_joins_the_bottom_and_top_of_its_shaft(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_wago(monkeypatch, {"TransportAnimation": [
        *_frames(100, [(0, 0, 0, 0), (10000, 0, 0, 60), (20000, 0, 0, 0)]),  # the lift
        *_frames(200, [(0, 0, 0, 0), (4000, 0, 0, 3)]),  # a gate: too little travel
        *_frames(300, [(0, 0, 0, 0), (8000, 20, 0, 40)]),  # moves sideways: not a lift
    ]})
    tables = {
        "gameobject_template": [{"entry": e, "type": links.GO_TYPE_TRANSPORT} for e in (100, 200, 300)],
        "gameobject": [
            {"id": e, "map": 1, "position_x": 10.0 * e, "position_y": 5.0, "position_z": 20.0}
            for e in (100, 200, 300)
        ] + [{"id": 100, "map": 0, "position_x": 0.0, "position_y": 0.0, "position_z": 0.0}],
    }
    found = links._lift_links(1, tables)
    assert found == [links.Link((1000.0, 5.0, 20.0), (1000.0, 5.0, 80.0), 20 * 7.0, EDGE_LIFT)]


def test_portals_link_only_as_a_pair(monkeypatch: pytest.MonkeyPatch) -> None:
    trigger = {1: (0.0, 0.0, 0.0), 2: (500.0, 0.0, 100.0), 3: (900.0, 900.0, 0.0)}
    _fake_wago(monkeypatch, {"AreaTrigger": [
        {"ID": str(i), "ContinentID": "1", "Pos_0": str(x), "Pos_1": str(y), "Pos_2": str(z)}
        for i, (x, y, z) in trigger.items()
    ]})
    teleport = {
        1: (505.0, 0.0, 100.0),  # 1 lands next to 2 ...
        2: (5.0, 0.0, 0.0),  # ... and 2 next to 1: a pair
        3: (0.0, 10.0, 0.0),  # a one-way drop onto 1
    }
    tables = {"areatrigger_teleport": [
        {"id": i, "target_map": 1, "target_position_x": x, "target_position_y": y, "target_position_z": z}
        for i, (x, y, z) in teleport.items()
    ]}
    found = links._portal_links(1, tables)
    assert found == [
        links.Link(trigger[1], teleport[1], PORTAL_COST_YARDS, EDGE_PORTAL),
        links.Link(trigger[2], teleport[2], PORTAL_COST_YARDS, EDGE_PORTAL),
    ]


# --- clustering -------------------------------------------------------------

def _poly_graph(centroid: list[tuple[float, float, float]], pairs: list[tuple[int, int]],
                area: float = 400.0) -> PolyGraph:
    n = len(centroid)
    adj: list[list[int]] = [[] for _ in range(n)]
    for a, b in pairs:
        adj[a].append(b)
        adj[b].append(a)
    indptr = np.concatenate([[0], np.cumsum([len(x) for x in adj])])
    return PolyGraph(np.array(centroid, dtype=float), np.full(n, area), np.zeros(n, dtype=bool),
                     indptr, np.array([v for x in adj for v in x], dtype=np.int64))


def test_clustering_keeps_only_ground_joined_to_a_hub() -> None:
    # 0-1-2 is a town with a flight master at 0; 3-4 is a rooftop nobody reaches.
    polys = _poly_graph([(0, 0, 0), (50, 0, 0), (100, 0, 0), (0, 300, 40), (50, 300, 40)],
                        [(0, 1), (1, 2), (3, 4)])
    labels = [Label("Goldshire", "Elwynn Forest", False, False)]
    graph = cluster(polys, np.zeros(5, dtype=np.int32), labels, [], [Anchor(0, 0, 0), Anchor(9000, 0, 0)])
    assert graph.position[:, :2].tolist() == [[0, 0], [50, 0], [100, 0]]
    assert graph.edges.tolist() == [[0, 1], [1, 2]]
    assert graph.cost.tolist() == [50.0, 50.0]
    assert graph.anchor_node == [0, None]


def test_a_lift_becomes_an_edge_between_its_floors() -> None:
    polys = _poly_graph([(0, 0, 0), (40, 0, 0), (0, 0, 60), (40, 0, 60)], [(0, 1), (2, 3)])
    labels = [Label("Thunder Bluff", "Mulgore", False, False)]
    lift = links.Link((0.0, 0.0, 0.0), (0.0, 0.0, 60.0), 140.0, EDGE_LIFT)
    graph = cluster(polys, np.zeros(4, dtype=np.int32), labels, [lift], [Anchor(40, 0, 60)])
    assert len(graph.position) == 4
    assert graph.kind.tolist().count(EDGE_LIFT) == 1
    assert graph.anchor_node == [3]


def test_a_lift_boards_from_the_ground_not_the_top_of_its_housing() -> None:
    # Thunder Bluff: the car rests at z 69, right over a patch of housing
    # (4, joined to nothing); the ground you board from is at z 61.
    polys = _poly_graph([(0, 5, 61), (40, 5, 61), (0, 0, 130), (40, 0, 130), (1, 1, 69)],
                        [(0, 1), (2, 3)])
    labels = [Label("Thunder Bluff", "Mulgore", False, False)]
    lift = links.Link((0.0, 0.0, 69.0), (0.0, 0.0, 130.0), 140.0, EDGE_LIFT)
    graph = cluster(polys, np.zeros(5, dtype=np.int32), labels, [lift], [Anchor(40, 0, 130)])
    lift_edge = graph.edges[graph.kind == EDGE_LIFT].tolist()
    assert [[graph.position[a, 2], graph.position[b, 2]] for a, b in lift_edge] == [[61, 130]]


# --- the .walk file ---------------------------------------------------------

def test_the_walk_file_has_the_layout_the_page_reads(tmp_path: Path) -> None:
    graph = WalkGraph(
        position=np.array([[10.4, -20.6, 3.0], [40.0, -20.0, 5.0], [70.0, -20.0, -1.0]]),
        label=np.array([0, 1, 1]),
        water=np.array([False, False, True]),
        edges=np.array([[0, 1], [1, 2]]),
        cost=np.array([30.2, 42.0]),
        kind=np.array([0, 1], dtype=np.uint8),
        labels=[Label("Kharanos", "Dun Morogh", False, False), Label("The Great Forge", "Ironforge", True, True)],
        anchor_node=[0, 1, None],
    )
    hubs = [Hub("t6", 10, -20, 3), Hub("s10.0", 40, -20, 5, dock=True), Hub("t99", 0, 0, 0)]
    kept, nodes, matrix = hub_matrix(graph, hubs)
    assert [h.key for h in kept] == ["t6", "s10.0"]
    assert nodes == [0, 1]
    assert matrix.tolist() == [[0, 30], [30, 0]]

    write_walk(tmp_path / "0.walk", 0, graph, kept, nodes, matrix)
    data = gzip.decompress((tmp_path / "0.walk").read_bytes())
    assert data[:4] == b"MGWK"
    version, map_id, n, m, h, json_bytes = struct.unpack_from("<2H4I", data, 4)
    assert (version, map_id, n, m, h) == (1, 0, 3, 2, 2)
    at = 24
    x, y, z = (np.frombuffer(data, "<i2", n, at + 2 * n * k).tolist() for k in range(3))
    assert (x, y, z) == ([10, 40, 70], [-21, -20, -20], [3, 5, -1])
    at += 6 * n
    assert np.frombuffer(data, "<u2", n, at).tolist() == [0, 1, 1]
    assert np.frombuffer(data, "u1", n, at + 2 * n).tolist() == [0, 0, 1]
    at += 3 * n
    assert np.frombuffer(data, "<u4", m, at).tolist() == [0, 1]
    assert np.frombuffer(data, "<u4", m, at + 4 * m).tolist() == [1, 2]
    assert np.frombuffer(data, "<u2", m, at + 8 * m).tolist() == [30, 42]
    assert np.frombuffer(data, "u1", m, at + 10 * m).tolist() == [0, 1]
    at += 11 * m
    assert np.frombuffer(data, "<u4", h, at).tolist() == [0, 1]
    assert np.frombuffer(data, "<u2", h * h, at + 4 * h).tolist() == [0, 30, 30, 0]
    at += 4 * h + 2 * h * h
    assert json.loads(data[at:at + json_bytes]) == {
        "labels": [["Kharanos", "Dun Morogh", 0, 0], ["The Great Forge", "Ironforge", 1, 1]],
        "hubs": ["t6", "s10.0"],
    }


def test_hubs_the_graph_cannot_join_are_marked_unreachable() -> None:
    graph = WalkGraph(np.array([[0.0, 0, 0], [900, 0, 0]]), np.zeros(2, dtype=int), np.zeros(2, dtype=bool),
                      np.zeros((0, 2), dtype=np.int64), np.zeros(0), np.zeros(0, dtype=np.uint8),
                      [Label("", "Durotar", False, False)], [0, 1])
    _, _, matrix = hub_matrix(graph, [Hub("t1", 0, 0, 0), Hub("t2", 900, 0, 0)])
    assert matrix.tolist() == [[0, UNREACHABLE], [UNREACHABLE, 0]]


# --- rooms ------------------------------------------------------------------

def _square(x0: float, y0: float, size: float, z: float) -> np.ndarray:
    """Two triangles covering a square floor at height ``z``."""
    a, b, c, d = (x0, y0, z), (x0 + size, y0, z), (x0 + size, y0 + size, z), (x0, y0 + size, z)
    return np.array([[a, b, c], [a, c, d]], dtype=float)


def _floors(*squares: tuple[np.ndarray, int, bool]) -> Floors:
    t = np.concatenate([s for s, _, _ in squares])
    group = np.concatenate([np.full(len(s), g) for s, g, _ in squares])
    interior = np.concatenate([np.full(len(s), i) for s, _, i in squares])
    return Floors(Triangles(t[:, 0], t[:, 1], t[:, 2]), group, interior)


def test_a_point_stands_on_the_floor_under_it_not_the_one_above() -> None:
    # A street (group 1, z 0) under a shop's upper floor (group 2, z 6).
    floors = _floors((_square(0, 0, 20, 0.0), 1, False), (_square(0, 0, 10, 6.0), 2, True))
    z, group, interior = floor_under(np.array([[5.0, 5.0, 0.5], [5.0, 5.0, 6.2], [15.0, 15.0, 0.0]]), floors)
    assert group.tolist() == [1, 2, 1]
    assert z.tolist() == [0.0, 6.0, 0.0]
    assert interior.tolist() == [False, True, False]


def test_a_point_off_every_floor_is_in_no_room() -> None:
    floors = _floors((_square(0, 0, 10, 0.0), 1, True))
    # Beside the building, and far under its floor (a cellar the building doesn't have).
    z, group, _ = floor_under(np.array([[30.0, 5.0, 0.0], [5.0, 5.0, -20.0]]), floors)
    assert group.tolist() == [-1, -1]
    assert np.isnan(z).all()


def test_rooms_say_when_they_are_open_air(monkeypatch: pytest.MonkeyPatch) -> None:
    # Stormwind: its streets are WMO groups flagged outdoors (Flags 4); a shop isn't.
    tables = {
        "AreaTable": [
            {"ID": "1519", "AreaName_lang": "Stormwind City", "ParentAreaID": "0", "Flags_0": "312"},
            {"ID": "5150", "AreaName_lang": "Trade District", "ParentAreaID": "1519", "Flags_0": "0"},
        ],
        "WMOAreaTable": [
            {"WMOID": "10", "NameSetID": "0", "WMOGroupID": "3", "AreaName_lang": "Trade District",
             "AreaTableID": "5150", "Flags": "4"},
            {"WMOID": "10", "NameSetID": "0", "WMOGroupID": "4", "AreaName_lang": "The Gilded Rose",
             "AreaTableID": "0", "Flags": "0"},
            {"WMOID": "10", "NameSetID": "0", "WMOGroupID": "-1", "AreaName_lang": "",
             "AreaTableID": "1519", "Flags": "0"},
        ],
    }
    monkeypatch.setattr(sources, "wago_table", lambda name, **_: tables[name])
    names = AreaNames()
    assert names.room(10, 0, 3) == ("Trade District", 5150, True)
    assert names.room(10, 0, 4) == ("The Gilded Rose", 0, False)
    # A group with no row of its own takes the building's, named after its area.
    assert names.room(10, 0, 9) == ("Stormwind City", 1519, False)
    assert names.room(99, 0, 1) == ("", 0, False)
