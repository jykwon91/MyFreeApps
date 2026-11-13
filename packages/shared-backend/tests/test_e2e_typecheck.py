"""Every app frontend with Playwright code type-checks it in CI, with one shared shape.

Playwright runs TypeScript without type-checking it, and each app's `typecheck` only covers src/.
So unless an app has a tsconfig.e2e.json, a `typecheck:e2e` script and a CI step that runs it, type
errors in its e2e/ code go unseen. MyRecipes had several before this check existed.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from tests.workflow_steps import cannot_fail, steps_running

_REPO_ROOT = Path(__file__).resolve().parents[3]
_SHARED_BASE = _REPO_ROOT / "packages" / "shared-frontend" / "tsconfig.e2e.base.json"
_EXPECTED_EXTENDS = ["./tsconfig.json", "../../../packages/shared-frontend/tsconfig.e2e.base.json"]
_SCRIPT = "tsc -p tsconfig.e2e.json"
_APP_FRONTENDS = sorted(path.parent for path in _REPO_ROOT.glob("apps/*/frontend/e2e") if path.is_dir())
# The web scaffold new_app copies: every new app starts with its tsconfig.e2e.json and script. Its
# CI step lives in ci-shared-frontend.yml (against a generated app), not a ci-<app>.yml.
_SCAFFOLD_FRONTEND = _REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend"
_E2E_FRONTENDS = [*_APP_FRONTENDS, _SCAFFOLD_FRONTEND]
_CONFIG_SHAPE = (
    "It must be exactly:\n"
    "{\n"
    f'  "extends": {json.dumps(_EXPECTED_EXTENDS)},\n'
    '  "include": ["e2e", <every playwright*.config.ts in the frontend root>],\n'
    '  "exclude": ["e2e/test-results*", "e2e/playwright-report"]\n'
    "}\n"
    "with no compilerOptions: they come from the app's tsconfig.json and the shared base."
)
_BASE_PINS: dict[str, object] = {
    "strict": True,
    "noEmit": True,
    "types": ["node"],
    "noUnusedLocals": True,
    "noUnusedParameters": True,
}
# Options that, set this way in the app's tsconfig.json, would loosen the e2e check. The shared
# base wins over the app tsconfig for the options it sets (strict, noUnusedLocals,
# noUnusedParameters), but not for the strict family's individual members.
_LOOSENING: dict[str, object] = {
    **{
        flag: False
        for flag in (
            "noImplicitAny",
            "strictNullChecks",
            "strictFunctionTypes",
            "strictBindCallApply",
            "strictPropertyInitialization",
            "strictBuiltinIteratorReturn",
            "noImplicitThis",
            "alwaysStrict",
            "useUnknownInCatchVariables",
        )
    },
    "noCheck": True,
}
# A JSON string (kept, so a "//" inside one survives) or a // or /* */ comment (dropped).
_JSONC_TOKEN = re.compile(r'"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/', re.DOTALL)


def _strip_jsonc_comments(source: str) -> str:
    return _JSONC_TOKEN.sub(lambda match: match.group(0) if match.group(0).startswith('"') else "", source)


def _read_tsconfig_text(source: str) -> dict[str, object]:
    return json.loads(_strip_jsonc_comments(source))


def _read_tsconfig(path: Path) -> dict[str, object]:
    return _read_tsconfig_text(path.read_text(encoding="utf-8"))


def _compiler_options(config: dict[str, object]) -> dict[str, object]:
    options = config.get("compilerOptions", {})
    assert isinstance(options, dict)
    return options


def _app(frontend: Path) -> str:
    return frontend.parent.name


def test_comments_do_not_count_as_config_or_ci_steps() -> None:
    assert _read_tsconfig_text('{"a": "x//y", /* "b": 1, */ // "c": 2\n "d": 3}') == {"a": "x//y", "d": 3}
    workflow = """
jobs:
  build:
    steps:
      # - run: npm run typecheck:e2e --workspace=app-frontend
      - run: |
          # npm run typecheck:e2e --workspace=app-frontend
          npm run lint --workspace=app-frontend
"""
    assert steps_running(workflow, "npm run typecheck:e2e --workspace=app-frontend") == []


@pytest.mark.parametrize(
    ("job_extra", "step_extra", "expected"),
    [
        ("", "", False),
        ("", "        if: ${{ !cancelled() }}\n", False),
        ("", "        continue-on-error: true\n", True),
        ("    continue-on-error: true\n", "", True),
        ("", "        if: false\n", True),
        ("", "        if: ${{ false }}\n", True),
        ("    if: 'false'\n", "", True),
    ],
)
def test_a_step_that_cannot_fail_is_recognised(job_extra: str, step_extra: str, expected: bool) -> None:
    workflow = (
        "jobs:\n  build:\n" + job_extra + "    steps:\n"
        "      - run: npm run typecheck:e2e --workspace=app-frontend\n" + step_extra
    )
    [(job, step)] = steps_running(workflow, "npm run typecheck:e2e --workspace=app-frontend")
    assert (cannot_fail(job) or cannot_fail(step)) is expected


def test_shared_base_pins_the_options_that_make_the_check_strict() -> None:
    options = _compiler_options(_read_tsconfig(_SHARED_BASE))
    wrong = {key: options.get(key) for key, value in _BASE_PINS.items() if options.get(key) != value}
    assert not wrong, (
        f"{_SHARED_BASE.relative_to(_REPO_ROOT)} must set {_BASE_PINS}; these differ: {wrong}."
    )


def test_there_are_app_e2e_suites_to_check() -> None:
    assert _APP_FRONTENDS, "No apps/*/frontend/e2e found, so the checks below would pass on nothing."


@pytest.mark.parametrize("frontend", _E2E_FRONTENDS, ids=_app)
def test_app_has_an_e2e_tsconfig_in_the_shared_shape(frontend: Path) -> None:
    path = frontend / "tsconfig.e2e.json"
    where = path.relative_to(_REPO_ROOT)
    assert path.is_file(), f"{frontend.relative_to(_REPO_ROOT)} has e2e/ but no tsconfig.e2e.json. {_CONFIG_SHAPE}"
    config = _read_tsconfig(path)
    assert config.get("extends") == _EXPECTED_EXTENDS, f"{where} extends the wrong files. {_CONFIG_SHAPE}"
    assert "compilerOptions" not in config, f"{where} sets compilerOptions, which could loosen the check. {_CONFIG_SHAPE}"
    include = config.get("include")
    assert isinstance(include, list), f"{where} has no include list. {_CONFIG_SHAPE}"
    root_configs = sorted(p.name for p in frontend.glob("playwright*.config.ts"))
    missing = [name for name in ["e2e", *root_configs] if name not in include]
    assert not missing, f"{where} doesn't include {missing}, so they go unchecked. {_CONFIG_SHAPE}"


@pytest.mark.parametrize("frontend", _E2E_FRONTENDS, ids=_app)
def test_app_tsconfig_does_not_loosen_the_e2e_check(frontend: Path) -> None:
    path = frontend / "tsconfig.json"
    config = _read_tsconfig(path)
    assert "extends" not in config, (
        f"{path.relative_to(_REPO_ROOT)} extends another file, so this check can't see every option "
        "tsconfig.e2e.json inherits. Extend this test to follow the chain."
    )
    options = _compiler_options(config)
    loosened = {key: options[key] for key, value in _LOOSENING.items() if options.get(key) == value}
    assert not loosened, (
        f"{path.relative_to(_REPO_ROOT)} sets {loosened}, which tsconfig.e2e.json inherits and the "
        "shared base doesn't override, so the e2e check is looser than intended."
    )


@pytest.mark.parametrize("frontend", _E2E_FRONTENDS, ids=_app)
def test_app_has_the_e2e_typecheck_script(frontend: Path) -> None:
    scripts = json.loads((frontend / "package.json").read_text(encoding="utf-8"))["scripts"]
    assert scripts.get("typecheck:e2e") == _SCRIPT, (
        f"{frontend.relative_to(_REPO_ROOT)}/package.json needs \"typecheck:e2e\": \"{_SCRIPT}\"."
    )


@pytest.mark.parametrize("frontend", _APP_FRONTENDS, ids=_app)
def test_app_ci_runs_the_e2e_typecheck(frontend: Path) -> None:
    package = json.loads((frontend / "package.json").read_text(encoding="utf-8"))["name"]
    workflow = _REPO_ROOT / ".github" / "workflows" / f"ci-{_app(frontend)}.yml"
    where = workflow.relative_to(_REPO_ROOT)
    expected = f"npm run typecheck:e2e --workspace={package}"
    steps = steps_running(workflow.read_text(encoding="utf-8"), expected)
    assert steps, (
        f"{where} has no step running `{expected}`. Add it next to the frontend typecheck, or e2e "
        "type errors only show up when someone runs the suite."
    )
    assert any(not cannot_fail(job) and not cannot_fail(step) for job, step in steps), (
        f"{where} runs `{expected}` only in a step that can't fail it (continue-on-error: true, or "
        "an if: that is always false, on the step or its job)."
    )
