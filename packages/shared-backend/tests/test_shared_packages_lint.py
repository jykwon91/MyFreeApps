"""The shared web packages are linted, locally and in CI.

@platform/ui (packages/shared-frontend, including test-support/) and @platform/core
(packages/shared-core) are imported by every app, yet had no ESLint config and no CI lint step while
every app frontend was linted. These checks keep a `lint` script and a flat ESLint config in each, and
a CI step that runs the script in a way that can fail the job.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from tests.workflow_steps import cannot_fail, steps_running

_REPO_ROOT = Path(__file__).resolve().parents[3]
_CI_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "ci-shared-frontend.yml"
_CI_JOB = "shared-frontend-tests"
_PACKAGES = {
    "@platform/ui": _REPO_ROOT / "packages" / "shared-frontend",
    "@platform/core": _REPO_ROOT / "packages" / "shared-core",
}


@pytest.mark.parametrize("name", _PACKAGES)
def test_package_has_a_lint_script(name: str) -> None:
    manifest = json.loads((_PACKAGES[name] / "package.json").read_text(encoding="utf-8"))
    assert manifest["name"] == name
    assert manifest["scripts"].get("lint") == "eslint .", f"{name} must lint its whole package root"


@pytest.mark.parametrize("name", _PACKAGES)
def test_package_has_a_flat_eslint_config(name: str) -> None:
    configs = list(_PACKAGES[name].glob("eslint.config.*"))
    assert configs, f"{name} has no eslint.config.* file"


@pytest.mark.parametrize("name", _PACKAGES)
def test_ci_runs_the_lint_script_where_it_can_fail_the_job(name: str) -> None:
    command = f"npm run lint --workspace={name}"
    steps = [
        (job, step)
        for job, step in steps_running(_CI_WORKFLOW.read_text(encoding="utf-8"), command)
        if job.get("name") == _CI_JOB
    ]
    assert steps, f"{_CI_WORKFLOW.name} job {_CI_JOB} has no step running `{command}`"
    assert any(not cannot_fail(job) and not cannot_fail(step) for job, step in steps), (
        f"every `{command}` step in {_CI_JOB} is continue-on-error or `if: false`"
    )


def test_ui_test_support_is_covered_by_the_ui_lint() -> None:
    """eslint . only reaches test-support/ if no `ignores` entry in the config names it."""
    config = (_PACKAGES["@platform/ui"] / "eslint.config.mjs").read_text(encoding="utf-8")
    ignore_arrays = re.findall(r"ignores:\s*\[([^\]]*)\]", config)
    assert ignore_arrays, "eslint.config.mjs has no `ignores: [...]` array to check"
    for entries in ignore_arrays:
        assert "test-support" not in entries, f"test-support/ is ignored by the lint: ignores: [{entries}]"
