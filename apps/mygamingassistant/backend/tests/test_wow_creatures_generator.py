"""The creature index behind the World Map search — its pure steps and the committed output."""
from __future__ import annotations

import json
from pathlib import Path

from scripts.wow_world_map.creatures import (
    COLUMNS,
    MAX_SPOTS_PER_ZONE,
    SPOT_WIDTH,
    known_npc_ids,
    separate,
    shown_name,
    spread,
)

CLASSIC_DIR = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "worldMap" / "classic"
)
COMMITTED = json.loads((CLASSIC_DIR / "classicCreatures.json").read_text(encoding="utf-8"))
ROWS = {row[1]: row for row in COMMITTED["rows"]}


def test_hidden_names_are_dropped() -> None:
    assert shown_name("Lady Katrana Prestor")
    for hidden in ("[DND] Guard", "Invisible Stalker", "Test Dummy", "Spawn Trigger", "  "):
        assert not shown_name(hidden)


def test_spread_keeps_the_extremes_and_is_stable() -> None:
    points = [(float(i), 0.0) for i in range(100)]
    kept = spread(points, 4)
    assert len(kept) == 4 and kept[0] == 0 and 99 in kept
    assert spread(points, 4) == kept
    assert spread(points[:3], 5) == [0, 1, 2]


def test_separate_folds_spawns_on_top_of_each_other() -> None:
    assert separate([(0.0, 0.0), (10.0, 0.0), (100.0, 0.0)]) == [0, 2]


def test_known_npc_ids_reads_services_and_npc_givers_only() -> None:
    services = {"rows": [[1, 77]]}
    quests = {"giverColumns": ["type", "entry"], "givers": [["npc", 5], ["object", 9]]}
    assert known_npc_ids(services, quests) == {77, 5}


def test_lady_prestor_is_in_stormwind() -> None:
    assert COMMITTED["columns"] == COLUMNS
    row = dict(zip(COMMITTED["columns"], ROWS["Lady Katrana Prestor"]))
    assert row["spots"][0] == 1453
    assert row["spots"][2:4] == [80.1, 38.2]


def test_every_row_is_well_formed_and_capped() -> None:
    subzones = COMMITTED["subzones"]
    for row in COMMITTED["rows"]:
        spots = row[COLUMNS.index("spots")]
        assert spots and len(spots) % SPOT_WIDTH == 0
        zones = [spots[i] for i in range(0, len(spots), SPOT_WIDTH)]
        assert max(zones.count(z) for z in set(zones)) <= MAX_SPOTS_PER_ZONE
        assert all(0 <= spots[i + 1] < len(subzones) for i in range(0, len(spots), SPOT_WIDTH))


def test_services_are_not_repeated() -> None:
    services = json.loads((CLASSIC_DIR / "classicServices.json").read_text(encoding="utf-8"))
    quests = json.loads((CLASSIC_DIR / "classicQuests.json").read_text(encoding="utf-8"))
    placed = known_npc_ids(services, quests)
    assert not {row[0] for row in COMMITTED["rows"]} & placed
