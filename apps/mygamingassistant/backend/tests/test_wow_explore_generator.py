"""The MGA Explorer addon's data: the zones and areas Explore Azeroth counts, and where each area is."""
from __future__ import annotations

import json

import pytest

from scripts.wow_explore.build import EXPLORE_PATH, WORLD_MAP_DIR, explore_json, ground_spots, zone_continents
from scripts.wow_explore.explore import build_continents, leaf_criteria, overlay_centre, tree_children

TIRISFAL_MAP = 1420
BARRENS_MAP = 1413
CURRENT_ART = {TIRISFAL_MAP: 2126, BARRENS_MAP: 2170}
OLD_ART = 1210


def _tree(row_id: int, parent: int, criteria: int, text: str = "", order: int = 0) -> dict[str, str]:
    return {"ID": str(row_id), "Parent": str(parent), "CriteriaID": str(criteria), "Description_lang": text, "OrderIndex": str(order)}


def _criteria(row_id: int, kind: int, asset: int) -> dict[str, str]:
    return {"ID": str(row_id), "Type": str(kind), "Asset": str(asset)}


def _achievement(row_id: int, title: str, tree: int) -> dict[str, str]:
    return {"ID": str(row_id), "Title_lang": title, "Criteria_tree": str(tree)}


def _overlay(row_id: int, art: int, area: int, *, offset: tuple[int, int] = (100, 100), size: tuple[int, int] = (200, 100),
             hit: tuple[int, int, int, int] = (0, 0, 0, 0), area2: int = 0) -> dict[str, str]:
    left, top, right, bottom = hit
    return {
        "ID": str(row_id), "UiMapArtID": str(art), "OffsetX": str(offset[0]), "OffsetY": str(offset[1]),
        "TextureWidth": str(size[0]), "TextureHeight": str(size[1]),
        "HitRectLeft": str(left), "HitRectTop": str(top), "HitRectRight": str(right), "HitRectBottom": str(bottom),
        "AreaID_0": str(area), "AreaID_1": str(area2), "AreaID_2": "0", "AreaID_3": "0",
    }


def _tables(*, zone_overlays: list[dict[str, str]], current: list[dict[str, str]], extra_tree: list[dict[str, str]] | None = None,
            barrens_kind: int = 43) -> dict[str, list[dict[str, str]]]:
    """Explore Azeroth -> one continent each -> Tirisfal (two areas) and The Barrens (one)."""
    achievements = [
        _achievement(62053, "Explore Azeroth", 1),
        _achievement(62353, "Explore Eastern Kingdoms", 10),
        _achievement(62355, "Explore Kalimdor", 20),
        _achievement(768, "Explore Tirisfal Glades", 100),
        _achievement(750, "Explore The Barrens", 200),
    ]
    tree = [
        _tree(2, 1, 9001, "Eastern Kingdoms"), _tree(3, 1, 9002, "Kalimdor", order=1),
        _tree(11, 10, 9003, "Tirisfal Glades"), _tree(21, 20, 9004, "The Barrens"),
        _tree(101, 100, 1037, "Deathknell"), _tree(102, 100, 1043, "Brill", order=1),
        _tree(201, 200, 2001, "The Crossroads"),
        *(extra_tree or []),
    ]
    criteria = [
        _criteria(9001, 8, 62353), _criteria(9002, 8, 62355), _criteria(9003, 8, 768), _criteria(9004, 8, 750),
        _criteria(1037, 43, 236), _criteria(1043, 43, 230), _criteria(2001, barrens_kind, 300),
    ]
    return {
        "Achievement": achievements,
        "CriteriaTree": tree,
        "Criteria": criteria,
        "WorldMapOverlay": [*zone_overlays, *current],
        "UiMapXMapArt": [{"UiMapID": str(m), "UiMapArtID": str(a)} for m, a in CURRENT_ART.items()],
    }


ZONE_OVERLAYS = [
    _overlay(236, OLD_ART, 154, hit=(279, 366, 411, 488)),
    _overlay(230, OLD_ART, 159, offset=(537, 299), size=(128, 158), hit=(560, 320, 635, 418)),
    _overlay(300, CURRENT_ART[BARRENS_MAP], 380, offset=(501, 334), size=(100, 66)),
]
CURRENT = [
    _overlay(4997, CURRENT_ART[TIRISFAL_MAP], 154, offset=(227, 328), size=(256, 256), hit=(279, 366, 411, 488)),
    _overlay(5000, CURRENT_ART[TIRISFAL_MAP], 159, offset=(537, 299), size=(128, 256)),
]
CONTINENTS = {TIRISFAL_MAP: 0, BARRENS_MAP: 1}


def _build(tables: dict[str, list[dict[str, str]]], ground: dict[tuple[str, int], tuple[float, float]] | None = None):
    return build_continents(tables, CONTINENTS, ground or {})


class TestCriteriaTrees:
    def test_a_row_with_no_criteria_is_a_sub_tree_walked_in_place(self) -> None:
        rows = [_tree(2, 1, 0, "group"), _tree(3, 2, 77, "inner"), _tree(4, 1, 78, "after", order=1)]
        assert [r["CriteriaID"] for r in leaf_criteria(1, tree_children(rows))] == ["77", "78"]

    def test_children_follow_the_game_order(self) -> None:
        rows = [_tree(5, 1, 50, order=2), _tree(4, 1, 40, order=0), _tree(6, 1, 60, order=1)]
        assert [r["CriteriaID"] for r in leaf_criteria(1, tree_children(rows))] == ["40", "60", "50"]


class TestContinents:
    def test_both_continents_their_zones_and_areas_from_the_achievements(self) -> None:
        title, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT))
        assert title == "Explore Azeroth"
        assert [(c.achievement, c.name, c.continent) for c in continents] == [
            (62353, "Explore Eastern Kingdoms", 0),
            (62355, "Explore Kalimdor", 1),
        ]
        tirisfal = continents[0].zones[0]
        assert (tirisfal.achievement, tirisfal.name, tirisfal.map) == (768, "Tirisfal Glades", TIRISFAL_MAP)
        assert [(a.criteria, a.overlay, a.name) for a in tirisfal.areas] == [(1037, 236, "Deathknell"), (1043, 230, "Brill")]

    def test_an_old_art_overlay_finds_its_zone_through_todays_art_for_the_same_area(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT))
        assert continents[0].zones[0].map == TIRISFAL_MAP
        assert continents[0].zones[0].areas[0].texture == (227, 328)

    def test_an_overlay_on_todays_art_is_its_own_texture(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT))
        assert continents[1].zones[0].map == BARRENS_MAP
        assert continents[1].zones[0].areas[0].texture == (501, 334)

    def test_an_area_todays_art_does_not_draw_follows_its_zone_and_has_no_texture(self) -> None:
        city = _overlay(231, OLD_ART, 1497, offset=(600, 400), size=(100, 60))
        tables = _tables(
            zone_overlays=[*ZONE_OVERLAYS, city],
            current=CURRENT,
            extra_tree=[_tree(103, 100, 1045, "Undercity", order=2)],
        )
        tables["Criteria"].append(_criteria(1045, 43, 231))
        _, continents = _build(tables)
        undercity = continents[0].zones[0].areas[2]
        assert (undercity.name, undercity.texture, undercity.spot) == ("Undercity", None, "map")

    def test_a_border_area_on_two_maps_takes_the_map_the_others_agree_on(self) -> None:
        border = _overlay(6000, CURRENT_ART[BARRENS_MAP], 154, offset=(0, 0), size=(10, 10))
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=[*CURRENT, border]))
        assert continents[0].zones[0].map == TIRISFAL_MAP

    def test_areas_on_different_maps_stop_the_run(self) -> None:
        moved = [_overlay(5000, CURRENT_ART[BARRENS_MAP], 159, offset=(537, 299)), CURRENT[0]]
        with pytest.raises(SystemExit, match="Tirisfal Glades"):
            _build(_tables(zone_overlays=ZONE_OVERLAYS, current=moved))

    def test_a_criteria_of_another_kind_stops_the_run(self) -> None:
        with pytest.raises(SystemExit, match="type 27"):
            _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT, barrens_kind=27))


class TestSpots:
    def test_the_world_maps_ground_spot_wins_when_it_knows_the_area(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT), {("Brill", TIRISFAL_MAP): (61.9, 51.4)})
        brill = continents[0].zones[0].areas[1]
        assert (brill.x, brill.y, brill.spot) == (61.9, 51.4, "ground")

    def test_a_ground_spot_outside_the_areas_rect_loses_to_the_rect(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT), {("Deathknell", TIRISFAL_MAP): (80.0, 10.0)})
        deathknell = continents[0].zones[0].areas[0]
        assert (deathknell.x, deathknell.y, deathknell.spot) == (round(345 / 1002 * 100, 1), round(427 / 668 * 100, 1), "map")

    def test_the_rect_is_the_hit_rect_todays_art_draws(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT))
        deathknell, brill = continents[0].zones[0].areas
        assert deathknell.rect == (round(279 / 1002 * 100, 1), round(366 / 668 * 100, 1), round(411 / 1002 * 100, 1), round(488 / 668 * 100, 1))
        assert brill.rect == (round(537 / 1002 * 100, 1), round(299 / 668 * 100, 1), round(665 / 1002 * 100, 1), round(555 / 668 * 100, 1))

    def test_an_area_todays_art_does_not_draw_keeps_its_achievement_overlays_rect(self) -> None:
        city = _overlay(231, OLD_ART, 1497, offset=(600, 400), size=(100, 60))
        tables = _tables(zone_overlays=[*ZONE_OVERLAYS, city], current=CURRENT, extra_tree=[_tree(103, 100, 1045, "Undercity", order=2)])
        tables["Criteria"].append(_criteria(1045, 43, 231))
        _, continents = _build(tables)
        assert continents[0].zones[0].areas[2].rect == (round(600 / 1002 * 100, 1), round(400 / 668 * 100, 1), round(700 / 1002 * 100, 1), round(460 / 668 * 100, 1))

    def test_else_the_middle_of_the_hit_rect_over_the_map_layer(self) -> None:
        _, continents = _build(_tables(zone_overlays=ZONE_OVERLAYS, current=CURRENT))
        deathknell = continents[0].zones[0].areas[0]
        assert (deathknell.x, deathknell.y, deathknell.spot) == (round(345 / 1002 * 100, 1), round(427 / 668 * 100, 1), "map")

    def test_an_empty_hit_rect_uses_the_texture_rect(self) -> None:
        assert overlay_centre(_overlay(1, 1, 1, offset=(501, 334), size=(100, 66))) == (round(551 / 1002 * 100, 1), round(367 / 668 * 100, 1))


class TestFileShape:
    def test_one_zone_per_line_and_it_reads_back(self) -> None:
        doc = {"source": "s", "continents": [{"achievement": 1, "zones": [{"name": "a"}, {"name": "b"}]}]}
        text = explore_json(doc)
        assert json.loads(text) == doc
        assert '{"name":"a"},\n{"name":"b"}' in text


@pytest.fixture(scope="module")
def doc() -> dict:
    return json.loads(EXPLORE_PATH.read_text(encoding="utf-8"))


class TestCommittedFile:
    def test_explore_azeroth_is_eastern_kingdoms_and_kalimdor(self, doc: dict) -> None:
        assert doc["achievement"] == {"id": 62053, "name": "Explore Azeroth"}
        assert [(c["achievement"], c["continent"]) for c in doc["continents"]] == [(62353, 0), (62355, 1)]

    def test_forevers_own_zones_count(self, doc: dict) -> None:
        zones = {c["achievement"]: {z["name"] for z in c["zones"]} for c in doc["continents"]}
        assert "Riverglades" in zones[62353]
        assert {"Mount Hyjal", "Shen'dralas"} <= zones[62355]
        assert len(zones[62353]) == 23 and len(zones[62355]) == 20

    def test_pinned_zone_sizes(self, doc: dict) -> None:
        areas = {z["name"]: len(z["areas"]) for c in doc["continents"] for z in c["zones"]}
        assert areas["Tirisfal Glades"] == 16
        assert areas["Riverglades"] == 12
        assert areas["Moonglade"] == 1

    def test_every_area_is_on_its_zone_map_on_its_continent(self, doc: dict) -> None:
        continents = zone_continents(WORLD_MAP_DIR / "zones.json")
        ground = ground_spots(WORLD_MAP_DIR / "areas.json")
        for c in doc["continents"]:
            for z in c["zones"]:
                assert continents[z["map"]] == c["continent"], z["name"]
                for a in z["areas"]:
                    assert 0 <= a["x"] <= 100 and 0 <= a["y"] <= 100, (z["name"], a["name"])
                    left, top, right, bottom = a["rect"]
                    assert left <= a["x"] <= right and top <= a["y"] <= bottom, (z["name"], a["name"])
                    if a["spot"] == "ground":
                        assert ground[(a["name"], z["map"])] == (a["x"], a["y"])
