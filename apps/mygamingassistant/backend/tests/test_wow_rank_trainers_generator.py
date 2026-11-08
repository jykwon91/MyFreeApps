"""Who trains each crafting rank — the generator's pure steps and the committed output."""
from __future__ import annotations

import json
from pathlib import Path

from scripts.wow_world_map.rank_trainers import (
    COLUMNS,
    RANK_NAMES,
    RANK_SPELLS,
    area_label,
    build_rank_trainers,
    teachers_by_spell,
)

CLASSIC_DIR = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "games" / "wow-forever" / "data" / "worldMap" / "classic"
)
COMMITTED = json.loads((CLASSIC_DIR / "classicRankTrainers.json").read_text(encoding="utf-8"))

# classicServices.json columns: guid, npcId, subkind, tag, name, title, zone, subzone, x, y, z, faction
SERVICE = [1, 77, "profession_trainer", "tailoring", "Test Tailor", "Tailor", 10, "Town", 50.0, 60.0, 0, "A"]
ZONES = [{"id": 10, "name": "Testland", "kind": "zone"}]


def test_area_label_adds_the_subzone_only_when_it_differs() -> None:
    assert area_label("Goldshire", "Elwynn Forest") == "Goldshire, Elwynn Forest"
    assert area_label("Elwynn Forest", "Elwynn Forest") == "Elwynn Forest"
    assert area_label("", "Elwynn Forest") == "Elwynn Forest"


def test_teachers_by_spell_reads_trainer_lists_and_templates() -> None:
    journeyman_tailoring = RANK_SPELLS["tailoring"][0]
    tables = {
        "npc_trainer": [{"entry": 5, "spell": journeyman_tailoring}, {"entry": 6, "spell": 1}],
        "npc_trainer_template": [{"entry": 9, "spell": journeyman_tailoring}],
    }
    teachers = teachers_by_spell(tables, {7: 9, 8: 0})  # type: ignore[arg-type]
    assert teachers[journeyman_tailoring] == {5, 7}


def test_build_rank_trainers_keeps_only_located_trainers_with_the_row_shape() -> None:
    spell = RANK_SPELLS["tailoring"][0]
    result = build_rank_trainers([SERVICE], ZONES, {spell: {77, 999}})
    rows = result["tailoring"]["Journeyman"]
    assert rows == [[77, "Test Tailor", "A", 10, "Town, Testland", 50.0, 60.0, 0]]
    assert len(rows[0]) == len(COLUMNS)
    assert result["tailoring"]["Expert"] == []


def test_committed_file_covers_every_profession_and_rank() -> None:
    assert COMMITTED["ranks"] == list(RANK_NAMES)
    assert COMMITTED["columns"] == COLUMNS
    assert set(COMMITTED["trainers"]) == set(RANK_SPELLS)
    for ranks in COMMITTED["trainers"].values():
        assert set(ranks) == set(RANK_NAMES)
        for rows in ranks.values():
            assert all(len(row) == len(COLUMNS) for row in rows)


def test_every_journeyman_rank_has_trainers_for_both_factions() -> None:
    for profession, ranks in COMMITTED["trainers"].items():
        factions = {row[2] for row in ranks["Journeyman"]}
        assert {"A", "H"} <= factions | {"N"}, profession


def test_artisan_tailoring_trainers_are_split_by_faction() -> None:
    rows = COMMITTED["trainers"]["tailoring"]["Artisan"]
    by_faction = {row[2]: row[1] for row in rows}
    assert by_faction["A"] == "Timothy Worthington"  # Theramore Isle
    assert by_faction["H"] == "Daryl Stack"  # Tarren Mill


def test_artisan_blacksmithing_is_one_neutral_trainer() -> None:
    rows = COMMITTED["trainers"]["blacksmithing"]["Artisan"]
    assert [(row[1], row[2]) for row in rows] == [("Brikk Keencraft", "N")]


def test_capitals_are_listed_before_towns() -> None:
    rows = COMMITTED["trainers"]["tailoring"]["Journeyman"]
    flags = [row[7] for row in rows]
    assert flags == sorted(flags, reverse=True)
    assert flags[0] == 1 and flags[-1] == 0


def test_first_aid_expert_and_artisan_are_not_trainer_taught() -> None:
    first_aid = COMMITTED["trainers"]["firstaid"]
    assert len(first_aid["Journeyman"]) > 0
    assert first_aid["Expert"] == [] and first_aid["Artisan"] == []
