"""Tests for scripts/check-file-size.py, run against a throwaway git repo."""

from __future__ import annotations

import importlib.util
import subprocess
from pathlib import Path
from types import ModuleType

import pytest

SCRIPT = Path(__file__).resolve().parent.parent / "check-file-size.py"
SRC = "apps/demo/src/module.py"


def _load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("check_file_size", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check_file_size = _load_script()


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


def _write(repo: Path, rel_path: str, lines: int) -> None:
    path = repo / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("x = 1\n" * lines)


@pytest.fixture
def repo(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "test@example.com")
    _git(tmp_path, "config", "user.name", "test")
    (tmp_path / "README.md").write_text("base\n")
    _git(tmp_path, "add", ".")
    _git(tmp_path, "commit", "-q", "-m", "base")
    _git(tmp_path, "tag", "base")
    # count_lines_at_ref runs `git show` in the current directory.
    monkeypatch.chdir(tmp_path)
    return tmp_path


def _commit_base(repo: Path, lines: int) -> None:
    _write(repo, SRC, lines)
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "seed")
    _git(repo, "tag", "-f", "base")


def _rules(repo: Path, allow_growth: frozenset[str] = frozenset()) -> list[str]:
    violations = check_file_size.check_files(repo, "base", frozenset(), allow_growth)
    return [v.rule for v in violations]


def test_file_crossing_the_threshold_fails(repo: Path) -> None:
    _commit_base(repo, 468)
    _write(repo, SRC, 521)
    assert _rules(repo) == ["growth_guard"]


def test_new_file_over_the_threshold_fails(repo: Path) -> None:
    _write(repo, SRC, 501)
    assert _rules(repo) == ["growth_guard"]


def test_file_already_over_that_grows_fails(repo: Path) -> None:
    _commit_base(repo, 600)
    _write(repo, SRC, 601)
    assert _rules(repo) == ["growth_guard"]


def test_file_already_over_that_shrinks_or_holds_passes(repo: Path) -> None:
    _commit_base(repo, 600)
    _write(repo, SRC, 600)
    assert _rules(repo) == []
    _write(repo, SRC, 550)
    assert _rules(repo) == []


def test_file_growing_up_to_the_threshold_passes(repo: Path) -> None:
    _commit_base(repo, 400)
    _write(repo, SRC, 500)
    assert _rules(repo) == []


def test_allowlisted_file_may_grow(repo: Path) -> None:
    _commit_base(repo, 468)
    _write(repo, SRC, 521)
    assert _rules(repo, frozenset({SRC})) == []


def test_hard_limit_still_applies(repo: Path) -> None:
    _write(repo, SRC, 1001)
    assert _rules(repo) == ["hard_limit"]


def test_test_files_are_ignored(repo: Path) -> None:
    _write(repo, "apps/demo/tests/test_big.py", 900)
    assert _rules(repo) == []
