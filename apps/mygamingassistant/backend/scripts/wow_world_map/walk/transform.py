"""Model -> world placement transforms.

World axes: X north, Y west, Z up. A placement stores its rotation as three
angles in degrees ``(a, b, c)``; the world matrix is::

    Rz(b + 180°) · Ry(a) · Rx(c)

verified against the axis-aligned bounds every building placement (MODF)
carries — the transformed model bounds match them to ~0.1 yd.
"""
from __future__ import annotations

import math

import numpy as np

from scripts.wow_world_map.walk.models import Mesh
from scripts.wow_world_map.walk.terrain import Placement


def _rx(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def _ry(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def _rz(a: float) -> np.ndarray:
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def placement_matrix(p: Placement) -> np.ndarray:
    """4x4 model -> world matrix of a building / prop placement."""
    a, b, c = (math.radians(v) for v in p.rotation)
    m = np.eye(4)
    m[:3, :3] = _rz(b + math.pi) @ _ry(a) @ _rx(c) * p.scale
    m[:3, 3] = p.position
    return m


def quaternion_matrix(position: tuple[float, float, float],
                      q: tuple[float, float, float, float], scale: float) -> np.ndarray:
    """4x4 matrix of a doodad placed inside a building (model space)."""
    x, y, z, w = q
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    m = np.eye(4)
    m[:3, :3] = r * scale
    m[:3, 3] = position
    return m


def apply(matrix: np.ndarray, mesh: Mesh) -> np.ndarray:
    """World-space vertices of a mesh."""
    v = mesh.vertices.astype(np.float64)
    return v @ matrix[:3, :3].T + matrix[:3, 3]
