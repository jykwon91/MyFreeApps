"""WoW Forever World Map — the map tree, level ranges and the committed
outline masks the page hit-tests with.

The hit-test here mirrors the page's (``worldMap/mapHitTest.ts``): among the
current map's children whose world rectangle holds the point AND whose
outline mask covers it, the smallest rectangle wins. World positions are the
cmangos spawn / map-percent anchors used by the generator tests.
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts.wow_world_map.highlights import MASK_H, MASK_W, mask_covers, pack_mask
from scripts.wow_world_map.zones import level_range

FRONTEND_DATA = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "worldMap"
)
FRONTEND_PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public" / "wow-maps"

ELWYNN = 1429
WESTFALL = 1436
DUSKWOOD = 1431
EASTERN_KINGDOMS = 1415
AZEROTH = 947


def _zones() -> dict[int, dict[str, object]]:
    payload = json.loads((FRONTEND_DATA / "zones.json").read_text(encoding="utf-8"))
    return {int(z["id"]): z for z in payload["zones"]}


def _masks() -> dict[int, str]:
    payload = json.loads((FRONTEND_DATA / "mapMasks.json").read_text(encoding="utf-8"))
    assert (payload["width"], payload["height"]) == (MASK_W, MASK_H)
    return {int(k): v for k, v in payload["masks"].items()}


def _to_world(zone: dict[str, object], x: float, y: float) -> tuple[float, float]:
    min_x, max_x, min_y, max_y = zone["bounds"]  # type: ignore[misc]
    return max_x - y / 100 * (max_x - min_x), max_y - x / 100 * (max_y - min_y)


def _child_at(parent: int, continent: int, wx: float, wy: float) -> int | None:
    zones, masks = _zones(), _masks()
    best: tuple[float, int] | None = None
    for zid, zone in zones.items():
        if zone["parent"] != parent or zone["continent"] != continent:
            continue
        min_x, max_x, min_y, max_y = zone["bounds"]  # type: ignore[misc]
        if not (min_x <= wx <= max_x and min_y <= wy <= max_y):
            continue
        x = (max_y - wy) / (max_y - min_y) * 100
        y = (max_x - wx) / (max_x - min_x) * 100
        if zid in masks and not mask_covers(masks[zid], x, y):
            continue
        area = (max_x - min_x) * (max_y - min_y)
        if best is None or area < best[0]:
            best = (area, zid)
    return best[1] if best else None


def test_level_range_drops_outlier_sub_areas() -> None:
    # Dun Morogh: the level-56 Ironforge Submarine Facility is not the zone's range.
    dun_morogh = [4, 5, 5, 5, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 10, 10, 11, 12, 56]
    assert level_range(dun_morogh) == (4, 12)
    assert level_range([46, 47, 47, 50, 50, 51, 54, 55, 63]) == (46, 60)  # clamped to the cap
    assert level_range([15, 15]) is None  # too few areas to say
    assert level_range([0, 0, 0, 0]) is None


def test_pack_and_sample_mask_round_trip() -> None:
    bits = [False] * (MASK_W * MASK_H)
    bits[MASK_W * 40 + 60] = True  # the centre cell
    mask = pack_mask(bits)
    assert mask_covers(mask, 50.2, 50.4)
    assert not mask_covers(mask, 10, 10)
    assert not mask_covers(mask, -1, 50)  # off the map


def test_committed_map_tree_follows_ui_map_parents() -> None:
    payload = json.loads((FRONTEND_DATA / "zones.json").read_text(encoding="utf-8"))
    zones = _zones()
    world = payload["world"]
    assert world["id"] == AZEROTH and world["name"] == "Azeroth"
    assert {r["continent"] for r in world["regions"]} == {0, 1}
    ids = set(zones) | {AZEROTH}
    for zone in zones.values():
        assert zone["parent"] in ids, f"{zone['name']} has an unknown parent"
    assert zones[ELWYNN]["parent"] == EASTERN_KINGDOMS
    assert zones[1453]["parent"] == EASTERN_KINGDOMS  # Stormwind City: the continent, as in game
    assert zones[EASTERN_KINGDOMS]["parent"] == AZEROTH
    assert zones[2521]["parent"] == AZEROTH  # Zephras Isle, its own world map
    assert zones[ELWYNN]["territory"] == "alliance"
    assert zones[ELWYNN]["levels"] == [5, 10]
    # Forever-only zones claim no territory or levels the beta client hasn't tuned.
    for zone in zones.values():
        if zone.get("foreverOnly"):
            assert "territory" not in zone and "levels" not in zone


def test_committed_masks_and_art_exist_for_every_outlined_map() -> None:
    zones, masks = _zones(), _masks()
    outlined = {zid for zid, z in zones.items() if z.get("highlight")}
    # Zones get a hit-test mask; a continent's highlight is only its coastline.
    assert set(masks) == {zid for zid in outlined if zones[zid]["kind"] == "zone"}
    assert ELWYNN in masks and EASTERN_KINGDOMS not in masks
    assert EASTERN_KINGDOMS in outlined
    for zid in outlined:
        assert (FRONTEND_PUBLIC / "highlight" / f"{zid}.webp").is_file()
    for zid in [AZEROTH, *zones]:
        assert (FRONTEND_PUBLIC / f"{zid}.webp").is_file()


def test_hit_test_goldshire_is_elwynn() -> None:
    elwynn = _zones()[ELWYNN]
    wx, wy = _to_world(elwynn, 42.0, 65.0)  # Goldshire
    assert _child_at(EASTERN_KINGDOMS, 0, wx, wy) == ELWYNN


def test_hit_test_just_past_elwynn_borders() -> None:
    elwynn = _zones()[ELWYNN]
    assert _child_at(EASTERN_KINGDOMS, 0, *_to_world(elwynn, -2.0, 75.0)) == WESTFALL
    assert _child_at(EASTERN_KINGDOMS, 0, *_to_world(elwynn, 50.0, 102.0)) == DUSKWOOD


def test_hit_test_open_sea_is_nothing() -> None:
    ek = _zones()[EASTERN_KINGDOMS]
    assert _child_at(EASTERN_KINGDOMS, 0, *_to_world(ek, 15.0, 50.0)) is None  # The Great Sea
