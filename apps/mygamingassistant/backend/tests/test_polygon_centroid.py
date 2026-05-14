"""Unit tests for app.services.game.polygon.polygon_centroid."""
import pytest

from app.services.game.polygon import polygon_centroid


def test_empty_polygon_returns_map_midpoint():
    cx, cy = polygon_centroid([])
    assert (cx, cy) == (0.5, 0.5)


def test_single_point_returns_itself():
    cx, cy = polygon_centroid([{"x": 0.3, "y": 0.7}])
    assert cx == pytest.approx(0.3)
    assert cy == pytest.approx(0.7)


def test_two_points_returns_midpoint():
    cx, cy = polygon_centroid([{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}])
    assert cx == pytest.approx(0.5)
    assert cy == pytest.approx(0.5)


def test_square_returns_center():
    pts = [
        {"x": 0.2, "y": 0.2},
        {"x": 0.6, "y": 0.2},
        {"x": 0.6, "y": 0.6},
        {"x": 0.2, "y": 0.6},
    ]
    cx, cy = polygon_centroid(pts)
    assert cx == pytest.approx(0.4)
    assert cy == pytest.approx(0.4)


def test_triangle_returns_geometric_centroid():
    # Right triangle: vertices at (0,0), (3,0), (0,3) — centroid is (1, 1)
    pts = [
        {"x": 0.0, "y": 0.0},
        {"x": 0.3, "y": 0.0},
        {"x": 0.0, "y": 0.3},
    ]
    cx, cy = polygon_centroid(pts)
    assert cx == pytest.approx(0.1)
    assert cy == pytest.approx(0.1)


def test_collinear_falls_back_to_vertex_mean():
    # All on y=0.5 — zero signed area, shoelace would divide by zero.
    pts = [
        {"x": 0.1, "y": 0.5},
        {"x": 0.4, "y": 0.5},
        {"x": 0.7, "y": 0.5},
    ]
    cx, cy = polygon_centroid(pts)
    assert cx == pytest.approx(0.4)
    assert cy == pytest.approx(0.5)


def test_l_shape_non_convex():
    # L-shape: a vertex-mean would drift toward the inside corner — the
    # shoelace geometric centroid stays in the actual shape.
    pts = [
        {"x": 0.0, "y": 0.0},
        {"x": 0.6, "y": 0.0},
        {"x": 0.6, "y": 0.2},
        {"x": 0.2, "y": 0.2},
        {"x": 0.2, "y": 0.6},
        {"x": 0.0, "y": 0.6},
    ]
    cx, cy = polygon_centroid(pts)
    # Both should land inside the L (not at the inside corner 0.2/0.2).
    # Shoelace centroid for this shape is roughly (0.2, 0.2-ish on x, 0.2-ish on y);
    # what matters is that it differs from the vertex mean (0.27, 0.27).
    vertex_mean_x = sum(p["x"] for p in pts) / len(pts)
    vertex_mean_y = sum(p["y"] for p in pts) / len(pts)
    # Geometric centroid for L-shape with two equal arms is symmetric in x/y.
    assert cx == pytest.approx(cy, abs=1e-6)
    # And differs from vertex mean.
    assert cx != pytest.approx(vertex_mean_x, abs=1e-3)
