"""Decide, once per pull request, which parts of the monorepo's CI are relevant.

`.github/workflows/ci.yml` runs this in its single `changes` job and calls each
area's workflow only when its flag is not `false`. Before this existed every CI
workflow started its own runner just to decide it had nothing to do.

Fail open: any problem computing the diff, or an unexpected exception, turns
EVERY flag on. A gate may only skip work it is certain is unrelated.

Each rule list mirrors what the old per-workflow filter did, in GitHub's own
`paths:` semantics: patterns are tried in order, a file is relevant when the
LAST pattern that matches it is a positive one, and `!` negates.

Usage (ci.yml): BASE_SHA/HEAD_SHA in the environment, GITHUB_OUTPUT set.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections.abc import Iterable

# Editing the CI entry point or this script can change what runs for anything.
RUN_EVERYTHING = (
    ".github/workflows/ci.yml",
    ".github/scripts/ci_changes.py",
)

_PHONE_FREE_WEB = ("package.json", "package-lock.json")


def _web_app_rules(app: str, *, phone_excluded: bool = True) -> list[str]:
    """Rules of an app whose web/backend CI ignores phone-only files."""
    rules = [f"apps/{app}/**", "packages/**", *_PHONE_FREE_WEB, f".github/workflows/ci-{app}.yml"]
    if phone_excluded:
        rules += [f"!apps/{app}/mobile/**", "!packages/shared-mobile/**"]
    return rules


_MOBILE_PATHS = (
    "packages/shared-core/**",
    "packages/shared-mobile/**",
    *_PHONE_FREE_WEB,
    ".github/workflows/_mobile-checks.yml",
)

PATH_RULES: dict[str, list[str]] = {
    "mybookkeeper": _web_app_rules("mybookkeeper"),
    "myjobhunter": _web_app_rules("myjobhunter"),
    # MGA's pull_request filter never excluded phone paths (its push filter does).
    "mygamingassistant": _web_app_rules("mygamingassistant", phone_excluded=False),
    "mylanguagetutor": _web_app_rules("mylanguagetutor"),
    "myrecipes": _web_app_rules("myrecipes"),
    # No mobile app yet, so only the shared phone package is carved out.
    "mypizzatracker": [*_web_app_rules("mypizzatracker", phone_excluded=False), "!packages/shared-mobile/**"],
    "landing": ["sites/landing/**", "infra/Caddyfile", ".github/workflows/ci-landing.yml"],
    "myjobhunter_integration": ["apps/myjobhunter/**", "packages/**"],
    "mobile_mybookkeeper": [
        "apps/mybookkeeper/mobile/**",
        "apps/mybookkeeper/api-client/**",
        *_MOBILE_PATHS,
        ".github/workflows/ci-mobile-mybookkeeper.yml",
    ],
    "mobile_myjobhunter": [
        "apps/myjobhunter/mobile/**",
        "apps/myjobhunter/api-client/**",
        *_MOBILE_PATHS,
        ".github/workflows/ci-mobile-myjobhunter.yml",
    ],
    "mobile_mylanguagetutor": [
        "apps/mylanguagetutor/mobile/**",
        "apps/mylanguagetutor/api-client/**",
        *_MOBILE_PATHS,
        ".github/workflows/ci-mobile-mylanguagetutor.yml",
    ],
    "mobile_myrecipes": [
        "apps/myrecipes/mobile/**",
        "apps/myrecipes/api-client/**",
        *_MOBILE_PATHS,
        ".github/workflows/ci-mobile-myrecipes.yml",
    ],
    "mobile_foundation": [
        "packages/shared-core/**",
        "packages/shared-mobile/**",
        "infra/templates/scaffold-mobile/**",
        "packages/shared-backend/platform_shared/infra/new_app.py",
        "packages/shared-backend/platform_shared/infra/mobile_lock.py",
        "packages/shared-backend/platform_shared/infra/new_mobile.py",
        "packages/shared-backend/platform_shared/infra/render.py",
        "packages/shared-backend/platform_shared/infra/route_source.py",
        "packages/shared-backend/platform_shared/infra/screen_map.py",
        *_PHONE_FREE_WEB,
        ".github/workflows/_mobile-checks.yml",
        ".github/workflows/ci-mobile.yml",
    ],
    # Not required checks, so these may be narrower than "always": the shared web
    # packages' own tests, and the scaffold the web-scaffold job renders.
    "shared_frontend": [
        "packages/**",
        "infra/**",
        *_PHONE_FREE_WEB,
        ".github/workflows/ci-shared-frontend.yml",
    ],
}

# The conformance suite reads app, template and workflow source as text, so almost
# any change can affect it (that is why it always ran). Only plain documentation
# cannot: Markdown outside the trees the suite reads (the scaffold's CLAUDE.md lives
# under infra/templates) and docs/.
_DOC_ONLY = re.compile(r"^(docs/.*|(?!infra/|packages/|\.github/|scripts/).*\.md)$")

_PYTHON = re.compile(r"\.pyi?$")
_JS_TS = re.compile(r"\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|html)$")
_PYTHON_CONFIG = ("pyproject.toml", "ruff.toml", ".ruff.toml", ".pre-commit-config.yaml")
_DEPENDENCY_MANIFEST = re.compile(
    r"(^|/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|uv\.lock|poetry\.lock|pyproject\.toml|"
    r"Pipfile(\.lock)?|requirements[^/]*\.txt|go\.(mod|sum)|Cargo\.(toml|lock)|Gemfile(\.lock)?)$"
    r"|^\.github/(workflows|actions)/"
)
ALL_CODEQL_LANGUAGES = ["python", "javascript-typescript"]


def _glob(pattern: str) -> re.Pattern[str]:
    regex = re.escape(pattern).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
    return re.compile(f"^{regex}$")


def matches_paths(files: Iterable[str], patterns: list[str]) -> bool:
    """True when any file survives `patterns` the way GitHub's `on.<event>.paths` applies them."""
    compiled = [(p.startswith("!"), _glob(p.removeprefix("!"))) for p in patterns]
    for file in files:
        relevant = False
        for negated, regex in compiled:
            if regex.match(file):
                relevant = not negated
        if relevant:
            return True
    return False


def compute(files: list[str]) -> dict[str, str]:
    """Map every output name to 'true'/'false' (codeql_languages to a JSON array)."""
    if any(f in RUN_EVERYTHING for f in files):
        return everything_on()
    out = {name: _flag(matches_paths(files, rules)) for name, rules in PATH_RULES.items()}
    out["shared_backend"] = _flag(not all(_DOC_ONLY.match(f) for f in files))
    has_python = any(_PYTHON.search(f) for f in files)
    out["python_lint"] = _flag(
        has_python
        or any(os.path.basename(f) in _PYTHON_CONFIG for f in files)
        or ".github/workflows/ci-python-lint.yml" in files
    )
    out["dependency_review"] = _flag(any(_DEPENDENCY_MANIFEST.search(f) for f in files))
    codeql_all = any(f == ".github/workflows/codeql.yml" or f.startswith(".github/codeql/") for f in files)
    languages = [
        language
        for language, touched in (
            ("python", has_python),
            ("javascript-typescript", any(_JS_TS.search(f) for f in files)),
        )
        if touched or codeql_all
    ]
    out["codeql_languages"] = json.dumps(languages)
    return out


def _flag(value: bool) -> str:
    return "true" if value else "false"


def everything_on() -> dict[str, str]:
    out = {name: "true" for name in [*PATH_RULES, "shared_backend", "python_lint", "dependency_review"]}
    out["codeql_languages"] = json.dumps(ALL_CODEQL_LANGUAGES)
    return out


def changed_files(base_sha: str, head_sha: str) -> list[str]:
    """Files THIS PR changed (three-dot semantics: ignores commits that landed on main since)."""
    merge_base = subprocess.run(
        ["git", "merge-base", base_sha, head_sha], capture_output=True, text=True, check=True
    ).stdout.strip()
    diff = subprocess.run(
        ["git", "diff", "--name-only", "-z", "--no-renames", merge_base, head_sha],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [f for f in diff.split("\0") if f]


def main() -> int:
    try:
        files = changed_files(os.environ["BASE_SHA"], os.environ["HEAD_SHA"])
        outputs = compute(files)
        print("::group::changed files")
        print("\n".join(files))
        print("::endgroup::")
    except Exception as exc:  # noqa: BLE001 - the gate must never be the reason a PR skips its tests
        print(f"::warning::Could not compute changed files ({exc!r}); running everything.")
        outputs = everything_on()
    for name, value in outputs.items():
        print(f"{name}={value}")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as handle:
        handle.writelines(f"{name}={value}\n" for name, value in outputs.items())
    return 0


if __name__ == "__main__":
    sys.exit(main())
