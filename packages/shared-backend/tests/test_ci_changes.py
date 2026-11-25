"""The single `changes` gate in ci.yml (.github/scripts/ci_changes.py).

It decides, once per pull request, which areas' CI to call. It may only ever skip work it is
certain is unrelated, so these tests pin both directions: relevant changes stay relevant, and
unrelated ones (phone-only, docs-only, another app) do not start a runner.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest
import yaml

_REPO_ROOT = Path(__file__).resolve().parents[3]
_WORKFLOWS = _REPO_ROOT / ".github" / "workflows"
_SCRIPT = _REPO_ROOT / ".github" / "scripts" / "ci_changes.py"
_GATED_APPS = ["mybookkeeper", "myjobhunter"]
_PATH_FILTERED_APPS = ["mylanguagetutor", "myrecipes", "mypizzatracker"]
_WEB_APPS = [*_GATED_APPS, "mygamingassistant", *_PATH_FILTERED_APPS]


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("ci_changes", _SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_ci = _load()


def _flags(*files: str) -> dict[str, str]:
    return _ci.compute(list(files))


class TestPhoneOnlyChanges:
    """Phone code has its own workflows (ci-mobile-<app>.yml): a PR that only changes it must not
    run the website/backend CI of the apps whose gates carve it out."""

    @pytest.mark.parametrize("app", [*_GATED_APPS, "mylanguagetutor", "myrecipes"])
    def test_phone_only_change_is_not_relevant(self, app: str) -> None:
        flags = _flags(f"apps/{app}/mobile/src/App.tsx", "packages/shared-mobile/src/theme.ts")
        assert flags[app] == "false"

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
    def test_web_or_shared_change_stays_relevant(self, app: str, changed: str) -> None:
        assert _flags(changed.format(app=app))[app] == "true"

    @pytest.mark.parametrize("app", _GATED_APPS)
    def test_phone_files_mixed_with_a_backend_file_stay_relevant(self, app: str) -> None:
        assert _flags(f"apps/{app}/mobile/src/App.tsx", f"apps/{app}/backend/app/main.py")[app] == "true"

    @pytest.mark.parametrize("app", _WEB_APPS)
    def test_an_unrelated_change_is_not_relevant(self, app: str) -> None:
        assert _flags("apps/someotherapp/backend/app/main.py")[app] == "false"

    def test_phone_change_still_runs_that_apps_mobile_ci(self) -> None:
        assert _flags("apps/myjobhunter/mobile/src/App.tsx")["mobile_myjobhunter"] == "true"
        assert _flags("apps/myjobhunter/mobile/src/App.tsx")["mobile_myrecipes"] == "false"


class TestGitHubPathSemantics:
    def test_a_later_negation_carves_a_file_out(self) -> None:
        assert not _ci.matches_paths(["apps/a/mobile/x.ts"], ["apps/a/**", "!apps/a/mobile/**"])

    def test_a_later_positive_pattern_wins_back_a_file(self) -> None:
        assert _ci.matches_paths(["apps/a/mobile/x.ts"], ["!apps/a/mobile/**", "apps/a/**"])

    def test_single_star_does_not_cross_directories(self) -> None:
        assert not _ci.matches_paths(["package.json.d/x"], ["package.json"])
        assert not _ci.matches_paths(["apps/a/b/c.py"], ["apps/*.py"])
        assert _ci.matches_paths(["apps/a/b/c.py"], ["apps/**"])


class TestMgaFrontendOnlyPr:
    """The measured case: an MGA-only PR must call MGA and little else."""

    def test_only_mga_and_the_always_checks_are_called(self) -> None:
        flags = _flags("apps/mygamingassistant/frontend/src/App.tsx")
        on = {name for name, value in flags.items() if value not in ("false", "[]")}
        assert on == {"mygamingassistant", "shared_backend", "codeql_languages"}
        assert json.loads(flags["codeql_languages"]) == ["javascript-typescript"]


class TestSharedPackageChange:
    def test_a_shared_backend_change_reaches_every_web_app_and_python_checks(self) -> None:
        flags = _flags("packages/shared-backend/platform_shared/foo.py")
        assert all(flags[app] == "true" for app in _WEB_APPS)
        assert flags["shared_backend"] == flags["shared_frontend"] == flags["python_lint"] == "true"
        assert json.loads(flags["codeql_languages"]) == ["python"]


class TestDocsOnlyPr:
    @pytest.mark.parametrize("changed", ["README.md", "docs/guide/ci.md", "TECH_DEBT.md"])
    def test_documentation_starts_no_suite(self, changed: str) -> None:
        flags = _flags(changed)
        assert {name: value for name, value in flags.items() if value not in ("false", "[]")} == {}

    @pytest.mark.parametrize(
        "changed",
        ["infra/templates/scaffold/CLAUDE.md", "packages/shared-backend/README.md", ".github/PULL_REQUEST_TEMPLATE.md"],
    )
    def test_markdown_the_conformance_suite_reads_still_runs_it(self, changed: str) -> None:
        assert _flags(changed)["shared_backend"] == "true"

    def test_docs_mixed_with_code_runs_the_suite(self) -> None:
        assert _flags("README.md", "scripts/check-file-size.py")["shared_backend"] == "true"


class TestCodeql:
    def test_python_only(self) -> None:
        assert json.loads(_flags("apps/myjobhunter/backend/app/main.py")["codeql_languages"]) == ["python"]

    def test_both_languages(self) -> None:
        flags = _flags("apps/myjobhunter/backend/app/main.py", "apps/myjobhunter/frontend/src/a.tsx")
        assert json.loads(flags["codeql_languages"]) == ["python", "javascript-typescript"]

    @pytest.mark.parametrize("changed", [".github/workflows/codeql.yml", ".github/codeql/codeql-config.yml"])
    def test_codeql_config_changes_rescan_everything(self, changed: str) -> None:
        assert json.loads(_flags(changed)["codeql_languages"]) == _ci.ALL_CODEQL_LANGUAGES


class TestDependencyReview:
    @pytest.mark.parametrize(
        "changed",
        ["package-lock.json", "apps/x/backend/requirements.txt", "apps/x/backend/uv.lock", ".github/workflows/ci.yml"],
    )
    def test_manifest_changes_run_it(self, changed: str) -> None:
        assert _flags(changed)["dependency_review"] == "true"

    def test_source_changes_do_not(self) -> None:
        assert _flags("apps/x/frontend/src/a.tsx")["dependency_review"] == "false"


class TestFailOpen:
    @pytest.mark.parametrize("changed", [".github/workflows/ci.yml", ".github/scripts/ci_changes.py"])
    def test_editing_the_ci_entry_point_runs_everything(self, changed: str) -> None:
        flags = _flags(changed)
        assert all(value in ("true", json.dumps(_ci.ALL_CODEQL_LANGUAGES)) for value in flags.values())

    def test_a_diff_failure_runs_everything(self, tmp_path: Path) -> None:
        output = tmp_path / "out"
        result = subprocess.run(
            ["python", str(_SCRIPT)],
            env={"BASE_SHA": "0" * 40, "HEAD_SHA": "1" * 40, "GITHUB_OUTPUT": str(output), "PATH": os.environ["PATH"]},
            cwd=tmp_path,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        assert "mybookkeeper=true" in output.read_text()
        assert "running everything" in result.stdout


class TestCiYmlWiring:
    """ci.yml must call every reusable workflow, and the required check must be real."""

    _CI = yaml.safe_load((_WORKFLOWS / "ci.yml").read_text(encoding="utf-8"))

    @staticmethod
    def _callable_workflows() -> list[str]:
        callable_names = []
        for path in sorted(_WORKFLOWS.glob("*.yml")):
            if path.name in {"ci.yml", "_mobile-checks.yml"}:
                continue
            if "workflow_call" in yaml.safe_load(path.read_text(encoding="utf-8"))[True]:
                callable_names.append(path.name)
        return callable_names

    def test_every_reusable_workflow_is_called_from_ci_yml(self) -> None:
        called = {
            job["uses"].rsplit("/", 1)[-1] for job in self._CI["jobs"].values() if "uses" in job
        }
        assert set(self._callable_workflows()) == called

    def test_no_reusable_workflow_still_triggers_on_pull_request(self) -> None:
        for name in self._callable_workflows():
            triggers = yaml.safe_load((_WORKFLOWS / name).read_text(encoding="utf-8"))[True]
            assert "pull_request" not in triggers, f"{name} would run twice on a PR (directly and via ci.yml)."

    def test_every_call_is_gated_by_a_flag_the_script_emits(self) -> None:
        outputs = set(self._CI["jobs"]["changes"]["outputs"])
        emitted = set(_ci.compute([]))
        assert outputs == emitted
        for job_id, job in self._CI["jobs"].items():
            if "uses" in job:
                assert job["needs"] == "changes", job_id
                assert "!cancelled()" in job["if"], f"{job_id}: a failed gate must still run the job."

    @pytest.mark.parametrize("workflow", sorted(p.name for p in _WORKFLOWS.glob("ci-mobile-*.yml")))
    def test_every_mobile_app_has_a_rule_and_a_call(self, workflow: str) -> None:
        app = workflow.removeprefix("ci-mobile-").removesuffix(".yml")
        assert f"mobile_{app}" in _ci.PATH_RULES, f"Add mobile_{app} to PATH_RULES in .github/scripts/ci_changes.py."
        assert f"mobile-{app}" in self._CI["jobs"], f"Call {workflow} from ci.yml."

    def test_ci_gate_needs_every_job(self) -> None:
        """`ci-gate` is the only required check, so a job it doesn't wait for can fail and still merge."""
        jobs = self._CI["jobs"]
        gate = jobs["ci-gate"]
        assert set(gate["needs"]) == set(jobs) - {"ci-gate"}
        assert gate["if"] == "${{ always() }}"

    @pytest.mark.parametrize(
        ("results", "passes"),
        [
            ({"changes": "success", "mygamingassistant": "success", "mybookkeeper": "skipped"}, True),
            ({"changes": "success", "mygamingassistant": "failure"}, False),
            ({"changes": "success", "codeql": "cancelled"}, False),
            ({"changes": "skipped", "mygamingassistant": "skipped"}, False),
            ({"changes": "failure", "mygamingassistant": "success"}, False),
        ],
    )
    def test_ci_gate_verdict(self, results: dict[str, str], passes: bool) -> None:
        step = self._CI["jobs"]["ci-gate"]["steps"][0]
        script = step["run"].split("<<'PY'\n", 1)[1].rsplit("PY", 1)[0]
        needs = {job: {"result": result} for job, result in results.items()}
        out = subprocess.run(
            [sys.executable, "-c", script],
            env={**os.environ, "NEEDS": json.dumps(needs)},
            capture_output=True,
            text=True,
        )
        assert (out.returncode == 0) is passes, out.stdout + out.stderr
