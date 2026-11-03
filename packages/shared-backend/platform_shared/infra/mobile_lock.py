"""Add a generated mobile app to the root lockfile, at the versions already locked.

The scaffold is an npm workspace, so everything an app needs is locked under the template.
But npm doesn't reuse those entries for a new workspace: `npm install` resolves its nested
packages again, and takes whatever was published since. So a new app could get versions
nothing has tested, and an Expo patch release could fail CI on a PR that didn't change
anything mobile. Copying the template's entries first gives npm nothing to resolve. The
app's package.json must list the same dependencies as those entries, because `npm ci` only
notices a mismatch the lockfile can't satisfy, not a dropped dependency.

CLI::

    python -m platform_shared.infra.mobile_lock <app-slug>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from platform_shared.infra import new_app as _new_app
from platform_shared.infra import render as _render
from platform_shared.infra.new_app import ScaffoldError

_TEMPLATE_DIR = "infra/templates/scaffold-mobile"
_LOCKFILE = "package-lock.json"
_MANIFEST_KEYS = ("dependencies", "devDependencies", "peerDependencies")


def with_app(packages: dict[str, Any], slug: str) -> dict[str, Any]:
    """Return lockfile ``packages`` with copies of the template's entries for ``slug``."""
    template = packages.get(_TEMPLATE_DIR)
    if template is None:
        raise ScaffoldError(f"{_LOCKFILE} has no entry for {_TEMPLATE_DIR}. Run `npm install` at the repo root.")

    app_dir = f"apps/{slug}/mobile"
    name = f"{slug}-mobile"
    added = {
        app_dir + key.removeprefix(_TEMPLATE_DIR): entry
        for key, entry in packages.items()
        if key.startswith(f"{_TEMPLATE_DIR}/")
    }
    added[app_dir] = {**template, "name": name}
    added[f"node_modules/{name}"] = {"resolved": app_dir, "link": True}
    return {**packages, **added}


def _check_manifest(repo_root: Path, slug: str, template: dict[str, Any]) -> None:
    manifest_path = f"apps/{slug}/mobile/package.json"
    manifest = json.loads((repo_root / manifest_path).read_text(encoding="utf-8"))
    for key in _MANIFEST_KEYS:
        if manifest.get(key) != template.get(key):
            raise ScaffoldError(f"{manifest_path}: {key} differs from {_TEMPLATE_DIR} in {_LOCKFILE}.")


def add_app_to_lockfile(repo_root: Path, slug: str) -> None:
    path = repo_root / _LOCKFILE
    try:
        lock = json.loads(path.read_text(encoding="utf-8"))
        packages = with_app(lock["packages"], slug)
        _check_manifest(repo_root, slug, lock["packages"][_TEMPLATE_DIR])
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise ScaffoldError(f"Couldn't read what {_LOCKFILE} needs for {slug}: {exc!r}") from exc
    lock["packages"] = packages
    path.write_text(json.dumps(lock, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def _cli() -> int:
    parser = argparse.ArgumentParser(prog="platform_shared.infra.mobile_lock")
    parser.add_argument("slug")
    args = parser.parse_args()
    try:
        _new_app._validate_slug(args.slug)
        add_app_to_lockfile(_render._repo_root(), args.slug)
    except ScaffoldError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
