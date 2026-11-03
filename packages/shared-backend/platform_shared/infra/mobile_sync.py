"""Make a pull request that edits a web app say what happens on mobile.

The screen map catches added, renamed and removed pages. It can't see an edit to an
existing page, because the route stays the same. So a PR that changes a web app's source
must also change that app's mobile code, or carry this line in its description::

    Mobile: <why the mobile app doesn't need this>

This can't tell whether the two apps really match, only that someone decided. It looks at
apps with `mobile: true` and at least one built screen, since an app with none has nothing
to fall behind. Edits in shared web packages aren't checked: they'd flag every app. One line
covers every app the PR edits, so a PR changing two apps should explain both in it.

CLI, with the changed paths NUL-separated on stdin and the description in PR_BODY::

    git diff -z --name-only --no-renames HEAD^1 HEAD | python -m platform_shared.infra.mobile_sync
"""

from __future__ import annotations

import os
import re
import sys
from collections.abc import Iterable
from pathlib import Path

import yaml

from platform_shared.infra import render as _render
from platform_shared.infra import screen_map as _screen_map

_WEB_SOURCE = re.compile(r"apps/([^/]+)/frontend/src/(.+)")
# Text GitHub won't show the reader, or that isn't the author speaking. An unclosed comment
# or fence runs to the end of the description, the same as when GitHub renders it.
_NOT_A_DECISION = re.compile(r"<!--.*?(?:-->|\Z)|```.*?(?:```|\Z)", re.DOTALL)
# Case-sensitive, so `mobile: true` quoted from app.yaml isn't a reason. The lookahead
# rejects the placeholder from the error message, pasted as is.
_MOBILE_LINE = re.compile(r"^[ \t]*Mobile:[ \t]*(?!<[^>\n]*>\s*$)\S", re.MULTILINE)


def _web_edited_apps(changed: Iterable[str]) -> set[str]:
    edited: set[str] = set()
    for path in changed:
        match = _WEB_SOURCE.fullmatch(path)
        if match and not _screen_map._is_test_file(Path(match[2])):
            edited.add(match[1])
    return edited


def _has_screen(repo_root: Path, slug: str) -> bool:
    map_path = repo_root / "apps" / slug / "mobile" / _screen_map.SCREEN_MAP_FILENAME
    entries = _screen_map._load_map(map_path)
    return any(isinstance(entry, dict) and "screen" in entry for entry in entries.values())


def _has_decision(body: str) -> bool:
    return bool(_MOBILE_LINE.search(_NOT_A_DECISION.sub("", body)))


def check_pull_request(repo_root: Path, changed: Iterable[str], body: str) -> list[str]:
    """Return every web app this PR edited with no decision about mobile."""
    paths = list(changed)
    if _has_decision(body):
        return []

    errors: list[str] = []
    known_apps = set(_render._list_apps(repo_root))
    for slug in sorted(_web_edited_apps(paths) & known_apps):
        if not _render.is_mobile_app(_render._load_app_config(repo_root, slug)):
            continue
        if any(path.startswith(f"apps/{slug}/mobile/") for path in paths):
            continue
        try:
            if not _has_screen(repo_root, slug):
                continue
        except (OSError, _screen_map.ScreenMapError, yaml.YAMLError) as exc:
            errors.append(str(exc))
            continue
        errors.append(
            f"apps/{slug}/frontend/src changed and apps/{slug}/mobile didn't. If the mobile app "
            f"needs the same change, make it in this PR. If it doesn't, add a line to the PR "
            f"description: `Mobile: <why not>`. Editing the description reruns this check."
        )
    return errors


def _cli() -> int:
    changed = [path for path in sys.stdin.read().split("\0") if path]
    errors = check_pull_request(_render._repo_root(), changed, os.environ.get("PR_BODY", ""))
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(_cli())
