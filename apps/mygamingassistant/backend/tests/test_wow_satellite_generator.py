"""World Map satellite generator: grid maths, WDT parsing, crop alignment, publishing.

Fixtures only — no network. The landmark tests use Elwynn Forest's real
UiMapAssignment rectangle and Innkeeper Farley (Lion's Pride Inn, Goldshire,
43.8 / 65.8 on the zone map): in the client's minimap texture for ADT
(31, 49) the inn's roof is at about pixel (497, 380) — checked by eye against
the real tile, and by overlaying every Elwynn / Durotar / Stranglethorn NPC on
the stitched images.
"""
from __future__ import annotations

import io
import json
import struct
from pathlib import Path

import pytest
from PIL import Image

from scripts.wow_satellite.build import INDOOR_CITIES, MANIFEST, wanted
from scripts.wow_satellite.crop import Crop
from scripts.wow_satellite.grid import ADT_YARDS, tiles_covering, world_to_grid_px, zone_crop
from scripts.wow_satellite.publish import publish, satellite_key
from scripts.wow_satellite.render import OUT_HEIGHT, OUT_WIDTH, SEA_RGB, SOURCE_TILE_PX, render_zone
from scripts.wow_satellite.wdt import minimap_file_ids
from scripts.wow_world_map import sources
from scripts.wow_world_map.build import DATA_DIR
from scripts.wow_world_map.coords import ZoneBounds, zone_to_world

ELWYNN = ZoneBounds(1429, "Elwynn Forest", 0, min_x=-10254.17, max_x=-7939.58, min_y=-1935.42, max_y=1535.42)
FARLEY_PCT = (43.8, 65.8)
FARLEY_TILE = (31, 49)
FARLEY_TILE_PX = (497, 380)


def test_world_origin_is_the_middle_of_the_grid() -> None:
    assert world_to_grid_px(0, 0, 512) == (32 * 512, 32 * 512)


def test_one_adt_north_is_one_row_up_and_one_west_is_one_column_left() -> None:
    assert world_to_grid_px(ADT_YARDS, 0, 512) == pytest.approx((32 * 512, 31 * 512))
    assert world_to_grid_px(0, ADT_YARDS, 512) == pytest.approx((31 * 512, 32 * 512))


def test_landmark_lands_on_the_inn_in_its_minimap_tile() -> None:
    gx, gy = world_to_grid_px(*zone_to_world(ELWYNN, *FARLEY_PCT), SOURCE_TILE_PX)
    assert (int(gx // SOURCE_TILE_PX), int(gy // SOURCE_TILE_PX)) == FARLEY_TILE
    assert gx % SOURCE_TILE_PX == pytest.approx(FARLEY_TILE_PX[0], abs=4)
    assert gy % SOURCE_TILE_PX == pytest.approx(FARLEY_TILE_PX[1], abs=4)


@pytest.mark.parametrize("pct", [(0, 0), (100, 100), (25, 75), FARLEY_PCT, (99.9, 0.1)])
def test_zone_crop_is_the_zone_frame_on_the_grid(pct: tuple[float, float]) -> None:
    crop = zone_crop(ELWYNN, 512)
    gx, gy = world_to_grid_px(*zone_to_world(ELWYNN, *pct), 512)
    assert gx == pytest.approx(crop.left + pct[0] / 100 * crop.width)
    assert gy == pytest.approx(crop.top + pct[1] / 100 * crop.height)


def test_tiles_covering_elwynn() -> None:
    cells = tiles_covering(zone_crop(ELWYNN, 512), 512)
    assert {c for c, _ in cells} == set(range(29, 36))
    assert {r for _, r in cells} == set(range(46, 52))
    assert FARLEY_TILE in cells


def test_tiles_covering_clips_to_the_grid_and_ignores_a_touching_edge() -> None:
    assert tiles_covering(Crop(-100, -100, 512, 512), 512) == [(0, 0)]
    assert tiles_covering(Crop(64 * 512 - 10, 0, 64 * 512 + 900, 10), 512) == [(63, 0)]


def _wdt(cells: dict[tuple[int, int], int]) -> bytes:
    ids = [0] * (64 * 64 * 8)
    for (col, row), file_id in cells.items():
        ids[(row * 64 + col) * 8 + 7] = file_id
        ids[(row * 64 + col) * 8] = file_id + 1  # the root ADT — not a minimap
    maid = struct.pack(f"<{len(ids)}I", *ids)

    def chunk(tag: str, payload: bytes) -> bytes:
        return tag[::-1].encode("latin-1") + struct.pack("<I", len(payload)) + payload

    return chunk("MVER", struct.pack("<I", 18)) + chunk("MPHD", b"\0" * 32) + chunk("MAID", maid)


def test_wdt_minimap_ids_are_column_row_keyed() -> None:
    assert minimap_file_ids(_wdt({(31, 49): 204454, (35, 20): 204587})) == {(31, 49): 204454, (35, 20): 204587}


def test_wdt_without_maid_is_an_error() -> None:
    with pytest.raises(ValueError, match="MAID"):
        minimap_file_ids(b"REVM" + struct.pack("<I", 4) + b"\x12\0\0\0")


def _png(colour: tuple[int, int, int], dot: tuple[int, int] | None = None) -> bytes:
    img = Image.new("RGB", (SOURCE_TILE_PX, SOURCE_TILE_PX), colour)
    if dot:
        img.paste((255, 255, 255), (dot[0] - 12, dot[1] - 12, dot[0] + 12, dot[1] + 12))
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def test_render_puts_the_landmark_under_its_marker() -> None:
    cells = tiles_covering(zone_crop(ELWYNN, SOURCE_TILE_PX), SOURCE_TILE_PX)
    minimaps = {cell: 1000 + i for i, cell in enumerate(cells)}
    plain = _png((40, 120, 40))
    inn = _png((40, 120, 40), FARLEY_TILE_PX)
    image = render_zone(ELWYNN, minimaps, lambda fid: inn if fid == minimaps[FARLEY_TILE] else plain)
    assert image is not None and image.size == (OUT_WIDTH, OUT_HEIGHT)
    at = (round(FARLEY_PCT[0] / 100 * OUT_WIDTH), round(FARLEY_PCT[1] / 100 * OUT_HEIGHT))
    r, g, b = image.getpixel(at)  # type: ignore[misc]
    assert min(r, g, b) > 200, "the inn's dot must be under Farley's marker"
    r, g, b = image.getpixel((OUT_WIDTH // 2, 20))  # type: ignore[misc]
    assert (r, g, b) != (255, 255, 255)


def test_render_paints_sea_where_the_wdt_has_no_tile_and_skips_zones_with_none() -> None:
    cells = tiles_covering(zone_crop(ELWYNN, SOURCE_TILE_PX), SOURCE_TILE_PX)
    land = {cell: 7 for cell in cells if cell[0] >= 31}
    image = render_zone(ELWYNN, land, lambda _fid: _png((40, 120, 40)))
    assert image is not None
    assert image.getpixel((5, OUT_HEIGHT // 2)) == SEA_RGB
    assert render_zone(ELWYNN, {}, lambda _fid: b"") is None


def test_indoor_capitals_stay_drawn_only() -> None:
    assert INDOOR_CITIES == {1455, 1458}  # Ironforge, Undercity
    assert not wanted(ZoneBounds(1455, "Ironforge", 0, 0, 1, 0, 1))
    assert wanted(ELWYNN)


class _Bucket:
    def __init__(self, present: set[str]) -> None:
        self.objects = {k: b"" for k in present}

    def exists(self, key: str) -> bool:
        return key in self.objects

    def put(self, key: str, body: bytes) -> None:
        self.objects[key] = body


def test_publish_skips_keys_already_there(tmp_path: Path) -> None:
    (tmp_path / "1411.webp").write_bytes(b"webp")
    bucket = _Bucket({satellite_key("1.60.1.70790", 1429)})
    counts = publish("1.60.1.70790", [1429, 1411], tmp_path, bucket)
    assert counts == {"uploaded": 1, "present": 1, "would-upload": 0, "bytes": 4}
    assert bucket.objects["wow/1.60.1.70790/satellite/1411.webp"] == b"webp"
    again = publish("1.60.1.70790", [1429, 1411], tmp_path, bucket)
    assert again["uploaded"] == 0 and again["present"] == 2


def test_publish_dry_run_touches_nothing(tmp_path: Path) -> None:
    assert publish("1.60.1.70790", [1429], tmp_path, None)["would-upload"] == 1


def test_committed_manifest_matches_the_pinned_build_and_the_map_tree() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["build"] == sources.WAGO_BUILD
    assert (manifest["width"], manifest["height"]) == (OUT_WIDTH, OUT_HEIGHT)
    zones = json.loads((DATA_DIR / "zones.json").read_text(encoding="utf-8"))["zones"]
    outdoor = {z["id"] for z in zones if z["kind"] in ("zone", "city")}
    assert manifest["maps"] == sorted(manifest["maps"])
    assert set(manifest["maps"]) <= outdoor - INDOOR_CITIES
    assert {1429, 1411, 1434} <= set(manifest["maps"])
