"""A PR that only changes phone-app code must not run the website/backend CI.

Phone code has its own workflows (ci-mobile-<app>.yml). The `changes` gate in ci-mybookkeeper.yml and
ci-myjobhunter.yml reports relevant=false for such a PR, so their website and backend jobs are skipped
(a skipped job still satisfies required checks). The other apps have no required checks, so they
exclude phone paths in `on.pull_request.paths` instead.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[3]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"
_GATED_APPS = ["mybookkeeper", "myjobhunter"]
_PATH_FILTERED_APPS = ["mylanguagetutor", "myrecipes", "mypizzatracker"]
_APPS_WITH_PHONE_APP = {"mybookkeeper", "myjobhunter", "mylanguagetutor", "myrecipes"}
_GATE_START = 'NON_PHONE="$(grep -vE '


def _gate_matches(app: str, files: list[str], tmp_path: Path) -> bool:
    """Run the workflow's own relevance gate, as GitHub would (bash -e), on this changed-file list."""
    run = next(
        step["run"]
        for step in yaml.safe_load((_WORKFLOWS / f"ci-{app}.yml").read_text())["jobs"]["changes"]["steps"]
        if step.get("id") == "filter"
    )
    assert _GATE_START in run, f"ci-{app}.yml's changes gate must drop phone-only files before testing relevance."
    assert "| grep -q" not in run, "A piped `grep -q` can SIGPIPE its writer under pipefail and skip required jobs."
    output = tmp_path / "github_output"
    output.write_text("")
    gate = "set -uo pipefail\n" + run[run.index(_GATE_START):]
    result = subprocess.run(
        ["bash", "-e", "-c", gate],
        env={"PATH": os.environ["PATH"], "FILES": "\n".join(files), "GITHUB_OUTPUT": str(output)},
        check=False,
    )
    assert result.returncode == 0, f"ci-{app}.yml's gate exited {result.returncode} under bash -e."
    return output.read_text().strip() == "relevant=true"


@pytest.mark.parametrize("app", _GATED_APPS)
def test_phone_only_change_is_not_relevant(app: str, tmp_path: Path) -> None:
    phone_files = [f"apps/{app}/mobile/src/App.tsx", "packages/shared-mobile/src/theme.ts"]
    assert not _gate_matches(app, phone_files, tmp_path)


@pytest.mark.parametrize("app", _GATED_APPS)
@pytest.mark.parametrize(
    "changed",
    [
        "apps/{app}/backend/app/main.py",
        "apps/{app}/frontend/src/main.tsx",
        "packages/shared-backend/platform_shared/foo.py",
        "package-lock.json",
        ".github/workflows/ci-{app}.yml",
    ],
)
def test_web_or_shared_change_stays_relevant(app: str, changed: str, tmp_path: Path) -> None:
    assert _gate_matches(app, [changed.format(app=app)], tmp_path)


@pytest.mark.parametrize("app", _GATED_APPS)
def test_phone_files_mixed_with_a_backend_file_stay_relevant(app: str, tmp_path: Path) -> None:
    assert _gate_matches(app, [f"apps/{app}/mobile/src/App.tsx", f"apps/{app}/backend/app/main.py"], tmp_path)


@pytest.mark.parametrize("app", _GATED_APPS)
def test_an_unrelated_change_is_not_relevant(app: str, tmp_path: Path) -> None:
    assert not _gate_matches(app, ["apps/someotherapp/backend/app/main.py"], tmp_path)


@pytest.mark.parametrize("app", _PATH_FILTERED_APPS)
def test_path_filtered_apps_exclude_phone_paths(app: str) -> None:
    paths = yaml.safe_load((_WORKFLOWS / f"ci-{app}.yml").read_text())[True]["pull_request"]["paths"]
    expected = ["!packages/shared-mobile/**"]
    if app in _APPS_WITH_PHONE_APP:
        expected.insert(0, f"!apps/{app}/mobile/**")
    # Negations only take effect after the positive patterns they carve out of.
    assert paths[-len(expected):] == expected
