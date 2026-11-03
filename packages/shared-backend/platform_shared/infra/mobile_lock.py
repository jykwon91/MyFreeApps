"""Check what generating a mobile app did to the root lockfile.

The scaffold is an npm workspace, so everything an app needs is already locked. The only
allowed changes are the app's own workspace entry and link, with the template's
dependencies, and copies of the template's nested packages under the app's directory.
So a generated app can't bring in a package the template doesn't have.

CLI::

    python -m platform_shared.infra.mobile_lock <before.json> <after.json> <app-slug>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_TEMPLATE_DIR = "infra/templates/scaffold-mobile"
_MANIFEST_KEYS = ("dependencies", "devDependencies", "peerDependencies")


def lock_problems(before: dict[str, object], after: dict[str, object], slug: str) -> list[str]:
    """Return every lockfile change generating ``slug`` shouldn't have made."""
    app_dir = f"apps/{slug}/mobile"
    link = f"node_modules/{slug}-mobile"
    template = before.get(_TEMPLATE_DIR, {})
    problems: list[str] = []

    for key in sorted({*before, *after}):
        old, new = before.get(key), after.get(key)
        if key == link:
            if new != {"resolved": app_dir, "link": True}:
                problems.append(f"{key}: not a link to {app_dir}.")
        elif key == app_dir:
            if new is None or any(new.get(k) != template.get(k) for k in _MANIFEST_KEYS):
                problems.append(f"{key}: dependencies differ from {_TEMPLATE_DIR}.")
        elif key.startswith(f"{app_dir}/"):
            copied_from = _TEMPLATE_DIR + key.removeprefix(app_dir)
            if new != before.get(copied_from):
                problems.append(f"{key}: not a copy of an entry in {_TEMPLATE_DIR}.")
        elif old != new:
            problems.append(f"{key}: changed.")
    return problems


def _load_packages(path: str) -> dict[str, object]:
    return json.loads(Path(path).read_text(encoding="utf-8"))["packages"]


def _cli() -> int:
    parser = argparse.ArgumentParser(prog="platform_shared.infra.mobile_lock")
    parser.add_argument("before")
    parser.add_argument("after")
    parser.add_argument("slug")
    args = parser.parse_args()

    problems = lock_problems(_load_packages(args.before), _load_packages(args.after), args.slug)
    for problem in problems:
        print(problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(_cli())
