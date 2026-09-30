"""Repo-wide guards for the Python dependency chain and Dependabot auto-merge.

Every Python backend keeps a three-file chain:

    pyproject.toml --(uv lock)--> uv.lock --(uv export)--> requirements.txt

Each app's CI checks the first link (`backend-deps-resolve`), but those app
workflows are path-filtered, so they cannot be REQUIRED status checks, and a
non-required red check does not stop a merge. #1299 and #1308 (Dependabot) both
merged with a stale or unsatisfiable uv.lock and broke main that way. This suite
runs inside `shared-backend-tests`, which is required and never path-filtered,
so a broken chain in ANY app now blocks every merge, Dependabot's included.

Projects are discovered by glob, so a new app is covered without edits here.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tomllib
from pathlib import Path
from typing import Any

import pytest
import yaml

# tests/ -> shared-backend/ -> packages/ -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[3]

_UV_PROJECTS: list[Path] = sorted(
    p.parent
    for p in [
        *_REPO_ROOT.glob("apps/*/backend/uv.lock"),
        *_REPO_ROOT.glob("packages/*/uv.lock"),
    ]
)
_EXPORTED_PROJECTS: list[Path] = [
    p for p in _UV_PROJECTS if (p / "requirements.txt").is_file()
]

_FIX_HINT = (
    "Fix: in {project}, run `uv lock` (use `uv lock --upgrade-package <name>` "
    "to move a single dependency; never a blanket `--upgrade`), then "
    "`uv export --format requirements-txt --no-hashes --no-emit-project "
    "--output-file requirements.txt`, and commit pyproject.toml + uv.lock + "
    "requirements.txt together."
)

_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==([^\s;\\]+)")


def _rel(path: Path) -> str:
    return path.relative_to(_REPO_ROOT).as_posix()


def _normalize(name: str) -> str:
    """PEP 503 name normalization, as used by uv.lock."""
    return re.sub(r"[-_.]+", "-", name).lower()


def _requirements_pins(requirements: Path) -> dict[str, str]:
    pins: dict[str, str] = {}
    for line in requirements.read_text(encoding="utf-8").splitlines():
        match = _PIN.match(line.strip())
        if match:
            pins[_normalize(match.group(1))] = match.group(2)
    return pins


def _locked_versions(lock: Path) -> dict[str, str]:
    data: dict[str, Any] = tomllib.loads(lock.read_text(encoding="utf-8"))
    return {
        _normalize(pkg["name"]): pkg["version"]
        for pkg in data["package"]
        if "version" in pkg
    }


def test_projects_discovered() -> None:
    # Guards the globs themselves: if the layout moves, fail rather than
    # silently parametrizing over nothing.
    assert _REPO_ROOT / "apps" / "myrecipes" / "backend" in _UV_PROJECTS
    assert _REPO_ROOT / "packages" / "shared-backend" in _UV_PROJECTS


@pytest.mark.parametrize("project", _UV_PROJECTS, ids=_rel)
def test_uv_lock_satisfies_pyproject(project: Path) -> None:
    uv = shutil.which("uv")
    if uv is None:
        # CI installs uv for this suite (ci-shared-backend.yml), so a missing
        # binary there is a broken workflow, not a reason to pass.
        if os.environ.get("CI"):
            pytest.fail("uv is not on PATH in CI; ci-shared-backend.yml must install it.")
        pytest.skip("uv not installed locally")
    result = subprocess.run(
        [uv, "lock", "--check"],
        cwd=project,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, (
        f"{_rel(project)}/uv.lock does not satisfy its pyproject.toml "
        f"(`uv lock --check` exit {result.returncode}):\n{result.stderr.strip()}\n\n"
        + _FIX_HINT.format(project=_rel(project))
    )


@pytest.mark.parametrize("project", _EXPORTED_PROJECTS, ids=_rel)
def test_requirements_txt_matches_uv_lock(project: Path) -> None:
    # The backend image installs requirements.txt, not uv.lock, so a drift here
    # ships versions CI never resolved, or fails `pip install` outright.
    # #1308 left requirements.txt pinning sqlalchemy 2.0.54 and pwdlib 0.3.1
    # against a lock holding 2.0.52 and a fastapi-users that requires pwdlib
    # 0.3.0.
    locked = _locked_versions(project / "uv.lock")
    mismatches = [
        f"  {name}: requirements.txt=={pinned}, uv.lock=={locked.get(name, '<absent>')}"
        for name, pinned in sorted(_requirements_pins(project / "requirements.txt").items())
        if locked.get(name) != pinned
    ]
    assert not mismatches, (
        f"{_rel(project)}/requirements.txt disagrees with uv.lock:\n"
        + "\n".join(mismatches)
        + "\n\n"
        + _FIX_HINT.format(project=_rel(project))
    )


class TestDependabotAutoMergeGate:
    """Native auto-merge only waits for REQUIRED contexts, which cannot include
    the path-filtered app workflows. The auto-merge job must therefore verify
    the whole head commit itself and bind its approval to that commit."""

    _PATH = _REPO_ROOT / ".github" / "workflows" / "dependabot-auto-merge.yml"

    def _workflow(self) -> dict[str, Any]:
        return yaml.safe_load(self._PATH.read_text(encoding="utf-8"))

    def _steps(self) -> list[dict[str, Any]]:
        return self._workflow()["jobs"]["auto-merge"]["steps"]

    def _index(self, name_prefix: str) -> int:
        names = [step.get("name", "") for step in self._steps()]
        matches = [i for i, name in enumerate(names) if name.startswith(name_prefix)]
        assert len(matches) == 1, f"expected exactly one step named {name_prefix!r}, got {names}"
        return matches[0]

    def test_can_read_workflow_runs(self) -> None:
        assert self._workflow()["permissions"].get("actions") == "read"

    def test_revoke_then_wait_then_approve_then_enable(self) -> None:
        revoke = self._index("Revoke auto-merge")
        wait = self._index("Wait for every workflow")
        approve = self._index("Approve the verified commit")
        enable = self._index("Enable auto-merge")
        assert revoke < wait < approve < enable, (
            "Auto-merge must be revoked, then the head commit verified green, "
            "BEFORE approving or enabling auto-merge."
        )

    def test_wait_fails_on_any_non_green_run(self) -> None:
        run = self._steps()[self._index("Wait for every workflow")]["run"]
        assert "head_sha=$HEAD_SHA" in run
        assert '$3 != "success" && $3 != "skipped" && $3 != "neutral"' in run
        assert "exit 1" in run

    def test_approval_is_bound_to_the_verified_commit(self) -> None:
        run = self._steps()[self._index("Approve the verified commit")]["run"]
        assert 'commit_id="$HEAD_SHA"' in run
        assert "|| true" not in run, "A masked approval failure hides real blocks."

    def test_auto_merge_is_pinned_to_the_verified_commit(self) -> None:
        run = self._steps()[self._index("Enable auto-merge")]["run"]
        assert '--match-head-commit "$HEAD_SHA"' in run

    def test_gated_steps_share_the_non_major_bot_only_condition(self) -> None:
        condition = self._steps()[self._index("Approve the verified commit")]["if"]
        assert "semver-major" in condition and "steps.authors.outputs.safe == 'true'" in condition
        for prefix in ("Revoke auto-merge", "Wait for every workflow", "Enable auto-merge"):
            assert self._steps()[self._index(prefix)]["if"] == condition, prefix


def test_relock_guard_validates_the_token() -> None:
    # An expired PAT previously surfaced only as checkout's cryptic
    # "could not read Username"; the guard must probe the API and fail loudly.
    workflow = yaml.safe_load(
        (_REPO_ROOT / ".github" / "workflows" / "dependabot-relock.yml").read_text(encoding="utf-8")
    )
    steps: list[dict[str, Any]] = workflow["jobs"]["relock"]["steps"]
    guard = next(step for step in steps if step.get("id") == "guard")
    assert steps.index(guard) == 0
    assert "https://api.github.com/repos/$REPO" in guard["run"]
    assert "exit 1" in guard["run"]
