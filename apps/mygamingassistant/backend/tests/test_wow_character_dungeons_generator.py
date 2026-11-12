"""The character page's dungeon list build: boss names from the client, levels, order, bad ids fail."""
from __future__ import annotations

import pytest

from scripts.wow_character_dungeons.build import boss_kill_titles, dungeon_rows
from scripts.wow_character_dungeons.dungeons import CuratedDungeon

ACHIEVEMENTS = [
    {"ID": "63570", "Category": "14821", "Title_lang": "Edwin VanCleef Kills (Deadmines)"},
    {"ID": "1092", "Category": "14821", "Title_lang": "Archmage Arugal kills (Shadowfang Keep)"},
    {"ID": "63573", "Category": "14821", "Title_lang": "Durgen Dirgehammer Kills (Hall of Thanes)"},
    # Not a boss kill: wrong category.
    {"ID": "932", "Category": "14807", "Title_lang": "Total 5-player dungeons entered"},
]
LEVELS = {36: ["Deadmines", 16, 10], 33: ["Shadowfang Keep", 18, 10], 189: ["Scarlet Monastery", 30, 20]}


def test_boss_names_come_from_boss_kill_statistics_only() -> None:
    assert boss_kill_titles(ACHIEVEMENTS) == {63570: "Edwin VanCleef", 1092: "Archmage Arugal", 63573: "Durgen Dirgehammer"}


def test_rows_take_levels_and_sort_by_level() -> None:
    curated = (
        CuratedDungeon("Shadowfang Keep", None, (1092,), instance=33),
        CuratedDungeon("Scarlet Monastery", "Graveyard", (), instance=189, boss="Bloodmage Thalnos"),
        CuratedDungeon("Hall of Thanes", None, (63573,), levels=(13, 20)),
        CuratedDungeon("Deadmines", None, (63570,), instance=36),
    )
    rows = dungeon_rows(curated, boss_kill_titles(ACHIEVEMENTS), LEVELS)
    assert [(r["name"], r["levelMin"], r["levelMax"], r["requiredLevel"]) for r in rows] == [
        ("Hall of Thanes", 13, 20, None),
        ("Deadmines", 16, 16, 10),
        ("Shadowfang Keep", 18, 18, 10),
        ("Scarlet Monastery", 30, 30, 20),
    ]
    assert rows[0]["boss"] == "Durgen Dirgehammer"
    assert [r["classic"] for r in rows] == [False, True, True, True]
    # Untracked: the curated boss, no statistic.
    assert rows[3]["boss"] == "Bloodmage Thalnos" and rows[3]["statisticIds"] == []


def test_an_id_the_client_does_not_count_as_a_boss_kill_fails() -> None:
    with pytest.raises(SystemExit, match="932"):
        dungeon_rows((CuratedDungeon("Deadmines", None, (932,), instance=36),), boss_kill_titles(ACHIEVEMENTS), LEVELS)


def test_ids_naming_different_bosses_fail() -> None:
    curated = (CuratedDungeon("Deadmines", None, (63570, 1092), instance=36),)
    with pytest.raises(SystemExit, match="different bosses"):
        dungeon_rows(curated, boss_kill_titles(ACHIEVEMENTS), LEVELS)


def test_a_classic_name_must_match_the_guide_and_needs_levels() -> None:
    titles = boss_kill_titles(ACHIEVEMENTS)
    with pytest.raises(SystemExit, match="calls instance 36"):
        dungeon_rows((CuratedDungeon("The Deadmines", None, (63570,), instance=36),), titles, LEVELS)
    with pytest.raises(SystemExit, match="isn't a World Map dungeon"):
        dungeon_rows((CuratedDungeon("Deadmines", None, (63570,), instance=999),), titles, LEVELS)
    with pytest.raises(SystemExit, match="needs an instance or a level range"):
        dungeon_rows((CuratedDungeon("Deadmines", None, (63570,)),), titles, LEVELS)

