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


def test_manual_polygon_script_stays_deleted():
    """Mutate-the-JSON pre-load scripts are a bandaid (geometry that only
    exists if someone ran them). None may return for EITHER game — polygons
    live inline in the committed ``*_maps.json`` (single source of truth),
    enforced by ``test_every_seeded_zone_has_a_polygon``. The Valorant seed
    was authored by a throwaway generator that was deleted in the same PR;
    a ``.gen_*`` / ``_apply_*`` artifact reappearing means the bandaid is
    back.
    """
    forbidden = ["_apply_cs2_polygons.py", "_apply_valorant_polygons.py"]
    offenders = [
        f.name
        for f in _FIXTURES_DIR.glob("*.py")
        if f.name in forbidden or f.name.startswith(".gen_")
    ]
    # ``.gen_*`` is hidden on POSIX globs; check explicitly too.
    offenders += [
        p.name
        for p in _FIXTURES_DIR.iterdir()
        if p.is_file() and p.name.startswith(".gen_")
    ]
    assert not offenders, (
        f"Fixture-mutation script(s) present: {sorted(set(offenders))}. Keep "
        f"polygon geometry inline in the committed *_maps.json; do not "
        f"reintroduce a manual pre-load mutation step."
    )


def test_seeded_map_minimap_image_is_bundled():
    """Every seeded map that points at a bundled radar (``/minimaps/...``)
    must have that PNG vendored. A seeded map whose ``minimap_url`` 404s
    renders polygons over a blank/"not available" backdrop and leaves the
    operator unable to refine zones in the #656 editor (no reference radar).
    Guards the radar-image link in the chain for BOTH games.
    """
    public_minimaps = (
        Path(__file__).resolve().parents[2]
        / "frontend"
        / "public"
        / "minimaps"
    )
    missing = []
    for filename in _SEEDED_MAP_FIXTURES:
        for entry in _load_json(filename):
            for m in entry.get("maps", []):
                url = m.get("minimap_url") or ""
                if not url.startswith("/minimaps/"):
                    continue  # MinIO / operator-upload path — not bundled
                rel = url[len("/minimaps/"):]
                if not (public_minimaps / rel).is_file():
                    missing.append(f"{entry.get('game_slug')}/{m['slug']} -> {url}")
    assert not missing, (
        f"{len(missing)} seeded map(s) reference a bundled radar that is not "
        f"vendored under frontend/public/minimaps/: {missing}. Add the PNG or "
        f"switch the fixture's minimap_url off the bundled path."
    )
