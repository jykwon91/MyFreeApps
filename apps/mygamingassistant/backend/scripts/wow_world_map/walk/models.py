"""Collision geometry of buildings (WMO) and props (M2), in model space.

A WMO is a root file (header, doodad list, group FileDataIDs) plus one file
per group (room / outdoor section). Its collision is the triangles flagged
COLLISION, plus visible (RENDER) ones that aren't DETAIL — the rule the
client's own collision follows. A group also carries the id that names it in
``WMOAreaTable`` ("The Great Forge", "The Commons", ...).

An M2 carries a separate low-poly collision mesh (``collisionIndices`` /
``collisionPositions`` in its MD20 header); most props have none.
"""
from __future__ import annotations

import struct
from dataclasses import dataclass

import numpy as np

from scripts.wow_world_map.walk.client_files import chunk_map, chunks, client_file

MAT_DETAIL = 0x04
MAT_COLLISION = 0x08
MAT_RENDER = 0x20
GROUP_INTERIOR = 0x2000
MOGP_HEADER = 0x44


@dataclass
class Mesh:
    vertices: np.ndarray  # (n, 3) float32
    triangles: np.ndarray  # (m, 3) int32


@dataclass
class WmoGroup:
    group_id: int  # WMOAreaTable.WMOGroupID
    interior: bool
    bbox_min: tuple[float, float, float]
    bbox_max: tuple[float, float, float]
    mesh: Mesh


@dataclass(frozen=True)
class Doodad:
    file_data_id: int
    position: tuple[float, float, float]
    rotation: tuple[float, float, float, float]  # quaternion x, y, z, w
    scale: float


@dataclass
class Wmo:
    wmo_id: int  # WMOAreaTable.WMOID
    groups: list[WmoGroup]
    doodad_sets: list[list[Doodad]]


EMPTY = Mesh(np.zeros((0, 3), np.float32), np.zeros((0, 3), np.int32))


def _group(data: bytes) -> WmoGroup | None:
    mogp = next((d for t, d in chunks(data) if t == "MOGP"), None)
    if mogp is None:
        return None
    (flags,) = struct.unpack_from("<I", mogp, 8)
    bbox = struct.unpack_from("<6f", mogp, 12)
    (group_id,) = struct.unpack_from("<I", mogp, 56)
    sub = chunk_map(mogp[MOGP_HEADER:])
    if "MPY2" in sub:
        mat_flags = np.frombuffer(sub["MPY2"], dtype="<u2")[0::2]
    else:
        mat_flags = np.frombuffer(sub.get("MOPY", b""), dtype="u1")[0::2]
    if "MOVX" in sub:
        idx = np.frombuffer(sub["MOVX"], dtype="<u4").astype(np.int32)
    else:
        idx = np.frombuffer(sub.get("MOVI", b""), dtype="<u2").astype(np.int32)
    verts = np.frombuffer(sub.get("MOVT", b""), dtype="<f4").reshape(-1, 3)
    tris = idx.reshape(-1, 3)
    n = min(len(tris), len(mat_flags))
    tris, mat_flags = tris[:n], mat_flags[:n].astype(np.int32)
    render = (mat_flags & MAT_RENDER != 0) & (mat_flags & MAT_DETAIL == 0)
    keep = (mat_flags & MAT_COLLISION != 0) | render
    mesh = Mesh(verts.astype(np.float32), tris[keep])
    return WmoGroup(group_id, bool(flags & GROUP_INTERIOR), bbox[:3], bbox[3:], mesh)


def load_wmo(file_data_id: int) -> Wmo:
    root = chunk_map(client_file(file_data_id))
    mohd = root["MOHD"]
    (n_groups,) = struct.unpack_from("<I", mohd, 4)
    (wmo_id,) = struct.unpack_from("<I", mohd, 0x20)
    gfid = np.frombuffer(root.get("GFID", b""), dtype="<u4")[:n_groups]
    groups = [g for g in (_group(client_file(int(f))) for f in gfid if f) if g is not None]
    modi = np.frombuffer(root.get("MODI", b""), dtype="<u4")
    modd = root.get("MODD", b"")
    doodads = []
    for i in range(len(modd) // 40):
        (name_and_flags,) = struct.unpack_from("<I", modd, i * 40)
        pos = struct.unpack_from("<3f", modd, i * 40 + 4)
        quat = struct.unpack_from("<4f", modd, i * 40 + 16)
        (scale,) = struct.unpack_from("<f", modd, i * 40 + 32)
        name = name_and_flags & 0xFFFFFF
        fid = int(modi[name]) if name < len(modi) else 0
        doodads.append(Doodad(fid, pos, quat, scale))
    mods = root.get("MODS", b"")
    sets = []
    for i in range(len(mods) // 32):
        start, count = struct.unpack_from("<2I", mods, i * 32 + 20)
        sets.append([d for d in doodads[start:start + count] if d.file_data_id])
    return Wmo(wmo_id, groups, sets)


def wmo_group_file_ids(file_data_id: int) -> list[int]:
    root = chunk_map(client_file(file_data_id))
    (n_groups,) = struct.unpack_from("<I", root["MOHD"], 4)
    return [int(f) for f in np.frombuffer(root.get("GFID", b""), dtype="<u4")[:n_groups] if f]


def wmo_doodad_file_ids(file_data_id: int) -> list[int]:
    root = chunk_map(client_file(file_data_id))
    return [int(f) for f in np.frombuffer(root.get("MODI", b""), dtype="<u4") if f]


def load_m2_collision(file_data_id: int) -> Mesh:
    data = client_file(file_data_id)
    md20 = data
    if data[:4] == b"MD21":  # chunked M2: the MD20 block is the MD21 payload
        (size,) = struct.unpack_from("<I", data, 4)
        md20 = data[8:8 + size]
    if not md20 or md20[:4] != b"MD20" or len(md20) < 240:
        return EMPTY
    n_idx, ofs_idx, n_pos, ofs_pos = struct.unpack_from("<4I", md20, 216)
    if n_idx < 3 or n_pos < 3:
        return EMPTY
    idx = np.frombuffer(md20, dtype="<u2", count=n_idx - n_idx % 3, offset=ofs_idx).astype(np.int32)
    pos = np.frombuffer(md20, dtype="<f4", count=n_pos * 3, offset=ofs_pos).reshape(-1, 3)
    return Mesh(pos.astype(np.float32), idx.reshape(-1, 3))


@dataclass(frozen=True)
class GroupBox:
    group_id: int
    interior: bool
    bbox_min: tuple[float, float, float]
    bbox_max: tuple[float, float, float]


def wmo_group_boxes(file_data_id: int) -> tuple[int, list[GroupBox]]:
    """``(wmo id, group bounds)`` — a building's rooms without their meshes."""
    root = chunk_map(client_file(file_data_id))
    (wmo_id,) = struct.unpack_from("<I", root["MOHD"], 0x20)
    boxes = []
    for fid in wmo_group_file_ids(file_data_id):
        mogp = next((d for t, d in chunks(client_file(fid)) if t == "MOGP"), None)
        if mogp is None:
            continue
        (flags,) = struct.unpack_from("<I", mogp, 8)
        bbox = struct.unpack_from("<6f", mogp, 12)
        (group_id,) = struct.unpack_from("<I", mogp, 56)
        boxes.append(GroupBox(group_id, bool(flags & GROUP_INTERIOR), bbox[:3], bbox[3:]))
    return wmo_id, boxes
