"""Tests for LineupRead.effective_* resolution (Issue #2 correctness fix).

The pin-position contract:
  - explicit anchor set        → effective_* == anchor
  - no anchor, non-empty zone  → effective_* == polygon centroid
  - no anchor, empty/no zone   → effective_* is None (NOT the (0.5, 0.5)
    dead-centre sentinel — a fabricated centre pin is indistinguishable
    from a real one; None lets the frontend skip it and surface the
    "needs calibration" hint instead).

These are pure-schema tests — they build ``LineupRead`` directly so the
``@computed_field`` properties are exercised without a DB round-trip.
"""
from __future__ import annotations

import uuid

import pytest

from app.schemas.game.lineup_schemas import LineupRead, ZoneRead

SQUARE = [
    {"x": 0.1, "y": 0.2},
    {"x": 0.3, "y": 0.2},
    {"x": 0.3, "y": 0.4},
    {"x": 0.1, "y": 0.4},
]  # centroid == (0.2, 0.3)


def _zone(polygon: list[dict]) -> ZoneRead:
    return ZoneRead(
        id=uuid.uuid4(), slug="z", name="Z", polygon_points=polygon
    )


def _lineup(**kw) -> LineupRead:
    base = dict(
        id=uuid.uuid4(),
        title="t",
        status="accepted",
    )
    base.update(kw)
    return LineupRead(**base)


def test_effective_none_when_polygon_empty_and_no_anchor():
    """Empty polygon + no anchor → None for every effective_* field."""
    lr = _lineup(
        stand_zone=_zone([]),
        target_zone=_zone([]),
    )
    assert lr.effective_stand_x is None
    assert lr.effective_stand_y is None
    assert lr.effective_target_x is None
    assert lr.effective_target_y is None


def test_effective_none_when_zone_absent_and_no_anchor():
    """No zone at all + no anchor → None (not the centre sentinel)."""
    lr = _lineup(stand_zone=None, target_zone=None)
    assert lr.effective_stand_x is None
    assert lr.effective_target_y is None


def test_effective_is_centroid_when_polygon_non_empty():
    """Non-empty polygon, no anchor → the geometric centroid."""
    lr = _lineup(
        stand_zone=_zone(SQUARE),
        target_zone=_zone(SQUARE),
    )
    assert lr.effective_stand_x == pytest.approx(0.2)
    assert lr.effective_stand_y == pytest.approx(0.3)
    assert lr.effective_target_x == pytest.approx(0.2)
    assert lr.effective_target_y == pytest.approx(0.3)


def test_effective_is_explicit_anchor_when_set():
    """An explicit anchor wins over the polygon centroid."""
    lr = _lineup(
        stand_anchor_x=0.66,
        stand_anchor_y=0.77,
        target_anchor_x=0.11,
        target_anchor_y=0.22,
        stand_zone=_zone(SQUARE),
        target_zone=_zone(SQUARE),
    )
    assert lr.effective_stand_x == pytest.approx(0.66)
    assert lr.effective_stand_y == pytest.approx(0.77)
    assert lr.effective_target_x == pytest.approx(0.11)
    assert lr.effective_target_y == pytest.approx(0.22)


def test_explicit_anchor_resolves_even_when_polygon_empty():
    """Anchor set but polygon empty → anchor still wins (not None)."""
    lr = _lineup(
        stand_anchor_x=0.4,
        stand_anchor_y=0.5,
        stand_zone=_zone([]),
    )
    assert lr.effective_stand_x == pytest.approx(0.4)
    assert lr.effective_stand_y == pytest.approx(0.5)
