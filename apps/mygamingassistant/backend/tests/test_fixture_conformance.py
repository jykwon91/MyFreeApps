"""Fixture-pipeline conformance.

These tests encode the invariant that broke "lineups not showing on the
map": a seeded map zone with no polygon has no centroid, so every lineup in
it is unplaceable and the operator gets a permanent calibration notice. The
geometry must live inline in the committed JSON (single source of truth) and
``load_fixtures`` must only seed fixtures whose zones are fully calibrated.

Pure tests — no DB. They read the fixture JSON the loader reads.
"""
from pathlib import Path

import pytest

from app.services.game.fixture_loader import (
    _SEEDED_MAP_FIXTURES,
    _load_json,
)

_FIXTURES_DIR = Path(__file__).resolve().parents[1] / "app" / "fixtures"


def _all_zones(filename: str):
    for entry in _load_json(filename):
        for m in entry.get("maps", []):
            for z in m.get("zones", []):
                yield entry.get("game_slug"), m["slug"], z


@pytest.mark.parametrize("filename", _SEEDED_MAP_FIXTURES)
def test_every_seeded_zone_has_a_polygon(filename: str):
    """No seeded zone may ship with empty/degenerate polygon_points.

    Empty -> polygon_centroid returns the (0.5,0.5) map-centre sentinel /
    effective_* returns None -> the lineup is unplaceable. Catching this in
    CI is the regression guard for the manual-script bandaid that was removed
    (geometry now lives inline in the JSON).
    """
    offenders = [
        f"{game}/{map_slug}/{z['slug']}"
        for game, map_slug, z in _all_zones(filename)
        if len(z.get("polygon_points") or []) < 3
    ]
    assert not offenders, (
        f"{filename}: {len(offenders)} seeded zone(s) lack a usable polygon "
        f"(>=3 points): {offenders}. Add geometry inline in the JSON or "
        f"remove the file from _SEEDED_MAP_FIXTURES until it is calibrated."
    )


def test_valorant_fixture_not_seeded_until_calibrated():
    """valorant_maps.json must stay out of the seed set while its zones have
    no polygons (PR 11 paused). Re-adding it before shipping geometry would
    seed 69 unplaceable zones on a clean deploy. When Valorant geometry
    lands, delete this test in the same PR that adds the file to
    _SEEDED_MAP_FIXTURES.
    """
    assert "valorant_maps.json" not in _SEEDED_MAP_FIXTURES
    empty = [
        f"{m}/{z['slug']}"
        for _, m, z in _all_zones("valorant_maps.json")
        if not (z.get("polygon_points") or [])
    ]
    assert empty, (
        "valorant_maps.json now has polygons — this guard is stale; add the "
        "file to _SEEDED_MAP_FIXTURES and delete this test."
    )


def test_manual_polygon_script_stays_deleted():
    """The `_apply_cs2_polygons.py` mutate-the-JSON script was a bandaid
    (geometry that only existed if someone ran it). It must not return —
    polygons live inline in cs2_maps.json, enforced by the test above.
    """
    assert not (_FIXTURES_DIR / "_apply_cs2_polygons.py").exists(), (
        "_apply_cs2_polygons.py is back. Keep CS2 polygon geometry inline in "
        "cs2_maps.json (single source of truth); do not reintroduce a manual "
        "pre-load mutation step."
    )
