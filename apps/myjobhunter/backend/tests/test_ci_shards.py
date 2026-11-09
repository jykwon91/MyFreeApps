"""Every backend test file must run in CI.

Until 2026-11 each CI shard listed its test files by path, and about 50 files
were in no list: they never gated a merge and several had broken unnoticed.
These tests pin the replacement contract between tests/ci_shards.py,
tests/conftest.py and .github/workflows/ci-myjobhunter.yml.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

import pytest
import yaml

from tests.ci_shards import (
    ALL_SHARDS,
    CATCH_ALL_SHARD,
    LISTED_SHARDS,
    SHARD_ENV_VAR,
    shard_for,
)
from tests.conftest import pytest_ignore_collect

_TESTS_DIR = Path(__file__).parent
_WORKFLOW = _TESTS_DIR.parents[3] / ".github" / "workflows" / "ci-myjobhunter.yml"


def _test_files() -> list[str]:
    return sorted(p.relative_to(_TESTS_DIR).as_posix() for p in _TESTS_DIR.rglob("test_*.py"))


def _backend_tests_job() -> dict[str, Any]:
    workflow = yaml.safe_load(_WORKFLOW.read_text())
    return workflow["jobs"]["backend-tests"]


def _workflow_shards() -> list[str]:
    return [entry["name"] for entry in _backend_tests_job()["strategy"]["matrix"]["shard"]]


def _pytest_step() -> dict[str, Any]:
    steps = [s for s in _backend_tests_job()["steps"] if "pytest" in s.get("run", "")]
    assert len(steps) == 1, "backend-tests must have exactly one pytest step"
    return steps[0]


def test_workflow_runs_exactly_the_shards_defined_here() -> None:
    names = _workflow_shards()
    assert len(names) == len(set(names)), f"duplicate shard in workflow: {names}"
    assert set(names) == ALL_SHARDS, (
        "ci-myjobhunter.yml backend-tests matrix and tests/ci_shards.py disagree: "
        f"workflow={sorted(names)} ci_shards={sorted(ALL_SHARDS)}"
    )


def test_workflow_selects_files_by_shard_not_by_path() -> None:
    step = _pytest_step()
    assert step.get("env", {}).get(SHARD_ENV_VAR) == "${{ matrix.shard.name }}"
    args = step["run"].split()
    assert args[-1] == "tests", f"pytest must be given the whole tests/ dir: {step['run']!r}"
    explicit = [a for a in args if a.endswith(".py") or "/test_" in a or "::" in a]
    assert not explicit, f"pytest step must not name test files: {explicit}"
    assert "--timeout=60" in args


def test_every_test_file_runs_in_a_workflow_shard() -> None:
    run_shards = set(_workflow_shards())
    unrun = [f for f in _test_files() if shard_for(f) not in run_shards]
    assert not unrun, f"test files no CI shard runs: {unrun}"


def test_listed_files_exist_and_are_listed_once() -> None:
    on_disk = set(_test_files())
    listed = [f for files in LISTED_SHARDS.values() for f in files]
    missing = sorted(set(listed) - on_disk)
    assert not missing, f"tests/ci_shards.py lists files that do not exist: {missing}"
    twice = sorted(f for f, n in Counter(listed).items() if n > 1)
    assert not twice, f"files listed in more than one shard: {twice}"
    assert CATCH_ALL_SHARD not in LISTED_SHARDS


@pytest.mark.parametrize("shard", sorted(ALL_SHARDS))
def test_conftest_collects_only_the_shard_files(
    shard: str, monkeypatch: pytest.MonkeyPatch, pytestconfig: pytest.Config,
) -> None:
    monkeypatch.setenv(SHARD_ENV_VAR, shard)
    collected = [
        f for f in _test_files()
        if pytest_ignore_collect(_TESTS_DIR / f, pytestconfig) is None
    ]
    assert collected == [f for f in _test_files() if shard_for(f) == shard]
    assert collected, f"shard {shard!r} would run no tests"


def test_conftest_collects_everything_without_a_shard(
    monkeypatch: pytest.MonkeyPatch, pytestconfig: pytest.Config,
) -> None:
    monkeypatch.delenv(SHARD_ENV_VAR, raising=False)
    assert all(
        pytest_ignore_collect(_TESTS_DIR / f, pytestconfig) is None for f in _test_files()
    )
