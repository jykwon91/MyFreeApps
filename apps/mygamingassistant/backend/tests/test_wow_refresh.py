"""The WoW Forever refresh: choosing the build, pinning it, and describing changes."""
from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts.wow_refresh.__main__ import newest_build, repin
from scripts.wow_refresh.report import SECTIONS, WOW_DATA, _changed_generated_files, _strip_provenance, diff_section
from scripts.wow_world_map import sources

FOOD = next(s for s in SECTIONS if s.title == "Food and drink")
FLIGHTS = next(s for s in SECTIONS if s.title == "Flight points")


def test_newest_build_goes_by_publish_date_not_list_order() -> None:
    builds = {"wowf": [
        {"version": "1.60.1.70532", "created_at": "2026-10-21 16:45:08"},
        {"version": "1.60.1.70707", "created_at": "2026-10-30 03:20:13"},
        {"version": "1.60.1.70245", "created_at": "2026-10-13 21:18:10"},
    ]}
    assert newest_build(builds, "wowf") == "1.60.1.70707"


def test_a_missing_branch_fails_instead_of_looking_up_to_date() -> None:
    with pytest.raises(SystemExit, match="wowf"):
        newest_build({"wow": []}, "wowf")


def test_repin_replaces_only_the_two_builds() -> None:
    text = 'WAGO_BRANCH = "wowf"\nWAGO_BUILD = "1"\nWAGO_ERA_BRANCH = "e"\nWAGO_ERA_BUILD = "2"\n'
    assert repin(text, build="3", era_build="4") == (
        'WAGO_BRANCH = "wowf"\nWAGO_BUILD = "3"\nWAGO_ERA_BRANCH = "e"\nWAGO_ERA_BUILD = "4"\n'
    )


def test_repin_fails_when_a_pin_is_missing() -> None:
    with pytest.raises(SystemExit, match="WAGO_ERA_BUILD"):
        repin('WAGO_BUILD = "1"\n', build="3", era_build="4")


def test_diff_names_added_removed_and_changed_rows() -> None:
    old = {"foods": [{"id": 1, "name": "Bread", "heal": 10}, {"id": 2, "name": "Fish", "heal": 5}]}
    new = {"foods": [{"id": 1, "name": "Bread", "heal": 20}, {"id": 3, "name": "Stew", "heal": 7}]}
    assert diff_section(FOOD, old, new) == [
        "- added: Stew",
        "- changed: Bread (heal)",
        "- removed: Fish",
    ]


def test_diff_reads_rows_stored_as_arrays() -> None:
    old = {"nodeColumns": ["id", "name"], "nodes": [[2, "Stormwind"]]}
    new = {"nodeColumns": ["id", "name"], "nodes": [[2, "Stormwind"], [9, "Riverglades"]]}
    assert diff_section(FLIGHTS, old, new) == ["- added: Riverglades"]


def test_a_new_build_number_alone_is_not_a_data_change() -> None:
    old = {"source": "build 1", "foods": []}
    new = {"source": "build 2", "foods": []}
    assert _strip_provenance(old) == _strip_provenance(new)


def test_forever_area_triggers_win_and_classic_only_fills_gaps(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(name: str, *, branch: str = "wowf", build: str = "") -> list[dict[str, str]]:
        if branch == "wowf":
            return [{"ID": "1", "Pos_0": "moved"}]
        return [{"ID": "1", "Pos_0": "old"}, {"ID": "2", "Pos_0": "classic"}]
    monkeypatch.setattr(sources, "wago_table", fake)
    assert sources.area_triggers() == [{"ID": "1", "Pos_0": "moved"}, {"ID": "2", "Pos_0": "classic"}]


def test_changed_files_cover_deleted_and_added_data_but_nothing_else(tmp_path: Path) -> None:
    def git(*args: str) -> None:
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=tmp_path, check=True, capture_output=True)

    data = tmp_path / WOW_DATA
    data.mkdir(parents=True)
    (data / "same.json").write_text('{"source": "build 1", "rows": [1]}', encoding="utf-8")
    (data / "gone.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tsconfig.json").write_text("{}", encoding="utf-8")
    git("init", "-q")
    git("add", ".")
    git("commit", "-qm", "base")

    (data / "same.json").write_text('{"source": "build 2", "rows": [1]}', encoding="utf-8")
    (data / "gone.json").unlink()
    (data / "new.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tsconfig.json").write_text("{ // not JSON\n}", encoding="utf-8")

    assert _changed_generated_files(tmp_path) == [f"{WOW_DATA}/gone.json", f"{WOW_DATA}/new.json"]
