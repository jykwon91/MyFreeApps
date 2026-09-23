"""WoW Forever World Map generator — coordinate math, parsing, classification,
and sanity checks on the committed data files it produced.

The coordinate anchors are real NPCs: world positions from the cmangos
classic-db spawn table, expected map coordinates from warcraft.wiki.gg
(Innkeeper Farley / Maximillian Crowe: Elwynn Forest; Gryan Stoutmantle:
the page's "Westfall (Classic)" entry; Dhugru Gorelust: Durotar). Zone bounds
are the Forever client's UiMapAssignment rows (unchanged from Classic for
these zones).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.wow_world_map.classify import classify
from scripts.wow_world_map.coords import ZoneBounds, pick_zone, world_to_zone, zone_to_world
from scripts.wow_world_map.factions import FactionTemplate, usable_by
from scripts.wow_world_map.sql_dump import parse_values, read_tables

ELWYNN = ZoneBounds(1429, "Elwynn Forest", 0, -10254.17, -7939.58, -1935.42, 1535.42)
WESTFALL = ZoneBounds(1436, "Westfall", 0, -11733.33, -9400.0, -483.33, 3016.67)
DUROTAR = ZoneBounds(1411, "Durotar", 1, -1716.67, 1808.33, -7250.0, -1962.5)
DUN_MOROGH = ZoneBounds(1426, "Dun Morogh", 0, -7160.42, -3877.08, -3122.92, 1802.08)
IRONFORGE = ZoneBounds(1455, "Ironforge", 0, -5096.85, -4569.24, -1504.22, -713.59, nested=True)
STORMWIND = ZoneBounds(1453, "Stormwind City", 0, -9154.17, -7995.83, -14.58, 1722.92, nested=True)

# (npc, zone, world x, world y, wiki x, wiki y)
WIKI_ANCHORS = [
    ("Innkeeper Farley", ELWYNN, -9462.66, 16.1915, 43.8, 65.9),
    ("Maximillian Crowe", ELWYNN, -9472.8, -5.32661, 44.4, 66.2),
    ("Gryan Stoutmantle", WESTFALL, -10508.8, 1045.23, 56.2, 47.6),
    ("Dhugru Gorelust", DUROTAR, 356.192, -4837.95, 54.0, 41.0),
]

FRONTEND_DATA = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "games" / "wow-forever" / "data" / "worldMap"
)


@pytest.mark.parametrize(("npc", "zone", "wx", "wy", "wiki_x", "wiki_y"), WIKI_ANCHORS)
def test_world_to_zone_matches_published_coordinates(
    npc: str, zone: ZoneBounds, wx: float, wy: float, wiki_x: float, wiki_y: float
) -> None:
    x, y = world_to_zone(zone, wx, wy)
    # Wiki coordinates are rounded to 0.1 (Durotar's to whole numbers).
    tolerance = 0.6
    assert abs(x - wiki_x) <= tolerance, f"{npc}: x {x:.2f} vs wiki {wiki_x}"
    assert abs(y - wiki_y) <= tolerance, f"{npc}: y {y:.2f} vs wiki {wiki_y}"


def test_zone_to_world_inverts_world_to_zone() -> None:
    x, y = world_to_zone(ELWYNN, -9462.66, 16.19)
    wx, wy = zone_to_world(ELWYNN, x, y)
    assert wx == pytest.approx(-9462.66, abs=1e-6)
    assert wy == pytest.approx(16.19, abs=1e-6)


def test_pick_zone_puts_city_npcs_on_the_city_map() -> None:
    zones = [DUN_MOROGH, IRONFORGE, ELWYNN, STORMWIND]
    # Alexander Calder (Forlorn Cavern) sits near Ironforge's edge — a
    # deepest-rectangle rule alone would put him on Dun Morogh.
    assert pick_zone(zones, 0, -4608.55, -1109.55) is IRONFORGE
    assert pick_zone(zones, 0, -8980.0, 1041.09) is STORMWIND  # Demisette Cloyce
    assert pick_zone(zones, 0, -9462.66, 16.19) is ELWYNN  # Goldshire, outside the city map
    assert pick_zone(zones, 1, -9462.66, 16.19) is None  # wrong continent


def test_parse_values_handles_mysql_escapes_and_null() -> None:
    rows = list(parse_values("(1,'It''s',NULL,-2.5),(2,'a\\'b\\\\c','x,y)z',7);"))
    assert rows == [[1, "It's", None, -2.5], [2, "a'b\\c", "x,y)z", 7]]


def test_read_tables_maps_columns_and_skips_other_tables() -> None:
    dump = [
        "CREATE TABLE `creature` (\n",
        "  `guid` int unsigned NOT NULL,\n",
        "  `id` mediumint NOT NULL COMMENT 'Creature Identifier',\n",
        "  PRIMARY KEY (`guid`)\n",
        ") ENGINE=MyISAM;\n",
        "CREATE TABLE `other` (\n",
        "  `a` int\n",
        ");\n",
        "INSERT INTO `creature` VALUES (7,295),(8,906);\n",
        "INSERT INTO `other` VALUES (1);\n",
    ]
    tables = read_tables(dump, {"creature"})
    assert tables == {"creature": [{"guid": 7, "id": 295}, {"guid": 8, "id": 906}]}


def _template(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "NpcFlags": 0, "SubName": "", "TrainerType": 0, "TrainerClass": 0,
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    ("template", "expected"),
    [
        (_template(NpcFlags=0x10 | 0x1, SubName="Warlock Trainer", TrainerClass=9), ("class_trainer", "warlock")),
        (_template(NpcFlags=0x4, SubName="Demon Trainer"), ("demon_trainer", "warlock")),
        (_template(NpcFlags=0x10, SubName="Pet Trainer", TrainerType=3), ("pet_trainer", "hunter")),
        (_template(NpcFlags=0x10, SubName="Journeyman Tailor", TrainerType=2), ("profession_trainer", "tailoring")),
        (_template(NpcFlags=0x10, SubName="Weapon Master", TrainerType=2), ("weapon_master", "")),
        (_template(NpcFlags=0x80 | 0x4, SubName="Innkeeper"), ("innkeeper", "")),
        (_template(NpcFlags=0x80 | 0x4, SubName="Horse Breeder"), None),
        (_template(NpcFlags=0x8, SubName="Gryphon Master"), ("flight_master", "")),
        (_template(NpcFlags=0x1000), ("auctioneer", "")),
        (_template(NpcFlags=0x2), None),  # quest giver only
    ],
)
def test_classify(template: dict[str, object], expected: tuple[str, str] | None) -> None:
    assert classify(template) == expected


def _faction(tid: int, faction: int, group: int, friend: int, enemy: int) -> FactionTemplate:
    return FactionTemplate(tid, faction, group, friend, enemy, (), ())


def test_usable_by_reads_group_masks() -> None:
    templates = {
        # Player race templates: Alliance group 2|1, Horde group 4|1.
        **{t: _faction(t, t, 3, 2, 12) for t in (1, 3, 4, 115)},
        **{t: _faction(t, t, 5, 4, 10) for t in (2, 5, 6, 116)},
        11: _faction(11, 72, 2, 2, 4),  # Stormwind guard: hostile to Horde
        29: _faction(29, 76, 4, 4, 2),  # Orgrimmar: hostile to Alliance
        120: _faction(120, 21, 0, 0, 0),  # Booty Bay: neutral
        14: _faction(14, 14, 8, 0, 1),  # monster: hostile to players
    }
    assert usable_by(11, templates) == "A"
    assert usable_by(29, templates) == "H"
    assert usable_by(120, templates) == "N"
    assert usable_by(14, templates) is None
    assert usable_by(999, templates) is None


def test_committed_service_data_is_consistent() -> None:
    zones = json.loads((FRONTEND_DATA / "zones.json").read_text(encoding="utf-8"))
    services = json.loads(
        (FRONTEND_DATA / "classic" / "classicServices.json").read_text(encoding="utf-8")
    )
    zone_ids = {z["id"] for z in zones["zones"]}
    columns = services["columns"]
    assert services["source"]["license"].startswith("GPL-3.0")
    assert len(services["source"]["commit"]) == 40
    rows = [dict(zip(columns, row)) for row in services["rows"]]
    assert rows, "no service NPCs generated"
    for row in rows:
        assert row["zone"] in zone_ids
        assert 0 <= row["x"] <= 100 and 0 <= row["y"] <= 100
        assert row["faction"] in ("A", "H", "N")
    warlock_trainers = {r["name"]: r for r in rows if r["tag"] == "warlock" and r["subkind"] == "class_trainer"}
    assert warlock_trainers["Gimrizz Shadowcog"]["zone"] == 1426  # Kharanos, Dun Morogh
    assert warlock_trainers["Alexander Calder"]["zone"] == 1455  # Ironforge
    assert warlock_trainers["Zevrost"]["faction"] == "H"
    # Classic NPCs never land on a zone that only exists in Forever.
    forever_only = {z["id"] for z in zones["zones"] if z.get("foreverOnly")}
    assert forever_only, "expected Forever-only zones in zones.json"
    assert not any(row["zone"] in forever_only for row in rows)
    # Placement names come straight from area names: no stray whitespace.
    assert all(row["subzone"] == row["subzone"].strip() for row in rows)


def test_committed_travel_data_is_consistent() -> None:
    travel = json.loads((FRONTEND_DATA / "travel.json").read_text(encoding="utf-8"))
    node_ids = {n[0] for n in travel["nodes"]}
    for a, b in travel["edges"]:
        assert a in node_ids and b in node_ids
    names = {n[1] for n in travel["nodes"]}
    # Forever: Powderfuse Port (Riverglades) has no flight path.
    assert not any("Powderfuse" in name for name in names)
    # The flight-path name's zone wins over overlapping zone rectangles.
    columns = travel["nodeColumns"]
    nodes = {n[columns.index("name")]: dict(zip(columns, n)) for n in travel["nodes"]}
    vigil = next(v for k, v in nodes.items() if k.startswith("Morgan's Vigil"))
    assert vigil["zone"] == 1428  # Burning Steppes
    for transport in travel["transports"]:
        assert len(transport["stops"]) >= 2
