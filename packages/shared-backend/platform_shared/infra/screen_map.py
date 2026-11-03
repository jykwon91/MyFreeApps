"""Keep each mobile app's screens accounted for against its web routes.

A mobile app checks in ``apps/<slug>/mobile/screen-map.yaml``::

    routes:
      /recipes/:id:
        screen: recipes/[id]            # apps/<slug>/mobile/app/recipes/[id].tsx
      /security:
        not_on_mobile: Managed on the web app only.

Every web route needs exactly one entry, so adding, renaming or removing a page fails
CI until someone decides what happens on mobile. It can't tell that an existing page's
contents changed: the route is the same, so this has nothing to compare.

Routes are read from source rather than by running the router, so they are the paths
as written: a nested ``transactions`` is ``/transactions``, whatever its parents are.
A path that isn't a literal keys on its constant (``ADMIN_ROUTES.DASHBOARD``), and every
index route is ``/``. Anything that can't be read fails the check instead of being
skipped, and so does a frontend with no routes at all.

Apps without ``mobile: true`` in app.yaml are not checked.

CLI::

    python -m platform_shared.infra.screen_map --all
    python -m platform_shared.infra.screen_map --app <slug>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

from platform_shared.infra import render as _render
from platform_shared.infra import route_source as _route_source

SCREEN_MAP_FILENAME = "screen-map.yaml"

_SOURCE_SUFFIXES = frozenset({".ts", ".tsx", ".js", ".jsx"})
_ALLOWED_KEYS = frozenset({"screen", "not_on_mobile"})


class ScreenMapError(ValueError):
    """Raised when a screen map can't be read at all."""


def _is_test_file(path: Path) -> bool:
    return (
        bool({"__tests__", "test", "tests"} & set(path.parts))
        or ".test." in path.name
        or ".spec." in path.name
    )


def web_routes(repo_root: Path, slug: str) -> set[str]:
    """Return every route the app's web frontend declares.

    Raises :class:`ScreenMapError` if a route can't be read or the frontend has none. An
    app with no web frontend has no routes to map, so that's an empty set.
    """
    src = repo_root / "apps" / slug / "frontend" / "src"
    if not src.is_dir():
        return set()

    routes: set[str] = set()
    problems: list[str] = []
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if path.suffix not in _SOURCE_SUFFIXES or not path.is_file() or _is_test_file(rel):
            continue
        source = path.read_text(encoding="utf-8")
        if not _route_source.ROUTE_FILE_MARKER.search(source):
            continue
        location = f"apps/{slug}/frontend/src/{rel.as_posix()}"
        try:
            found, unreadable = _route_source.read_routes(source)
        except _route_source.RouteSourceError as exc:
            problems.append(f"{location}: {exc}")
            continue
        routes |= found
        problems += [f"{location}: {problem}" for problem in unreadable]

    if problems:
        raise ScreenMapError("\n".join(problems))
    if not routes:
        raise ScreenMapError(
            f"apps/{slug}/frontend/src has no routes this check can read, so nothing would be "
            f"checked. If its routes are declared some new way, teach route_source.py to read it."
        )
    return routes


def _load_map(path: Path) -> dict[str, object]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    routes = data.get("routes") if isinstance(data, dict) else None
    if not isinstance(routes, dict):
        raise ScreenMapError(f"{path} must be a mapping with a top-level `routes:` mapping.")
    return routes


def _screen_exists(mobile_dir: Path, screen: str) -> bool:
    app_dir = mobile_dir / "app"
    return (app_dir / f"{screen}.tsx").is_file() or (app_dir / screen / "index.tsx").is_file()


def _entry_errors(map_rel: str, route: object, entry: object, mobile_dir: Path) -> list[str]:
    if not isinstance(entry, dict) or set(entry) - _ALLOWED_KEYS or len(entry) != 1:
        return [
            f"{map_rel}: route {route!r} needs exactly one of `screen: <path under app/>` "
            f"or `not_on_mobile: <reason>`."
        ]
    value = next(iter(entry.values()))
    if not isinstance(value, str) or not value.strip():
        return [f"{map_rel}: route {route!r} has an empty {next(iter(entry))}."]
    if "screen" in entry and not _screen_exists(mobile_dir, value):
        return [f"{map_rel}: route {route!r} points at screen {value!r}, which has no file under app/."]
    return []


def check_app(repo_root: Path, slug: str) -> list[str]:
    """Return every problem with one app's screen map. Empty means it's in sync."""
    config = _render._load_app_config(repo_root, slug)
    mobile_dir = repo_root / "apps" / slug / "mobile"
    map_path = mobile_dir / SCREEN_MAP_FILENAME
    map_rel = f"apps/{slug}/mobile/{SCREEN_MAP_FILENAME}"

    if not _render.is_mobile_app(config):
        # Looks for tracked files, because switching branches leaves an ignored
        # node_modules behind in a directory git no longer has.
        if map_path.is_file() or (mobile_dir / "package.json").is_file():
            return [f"apps/{slug}/mobile exists, so apps/{slug}/app.yaml must set `mobile: true`."]
        return []

    if not map_path.is_file():
        return [f"{map_rel} is missing. Every app with `mobile: true` needs one."]
    try:
        entries = _load_map(map_path)
        declared = web_routes(repo_root, slug)
    except (ScreenMapError, yaml.YAMLError) as exc:
        return [str(exc)]

    errors = [
        f"{map_rel}: web route {route!r} has no entry. Add `screen:` or `not_on_mobile:`."
        for route in sorted(declared - set(entries))
    ]
    errors += [
        f"{map_rel}: {route!r} is no longer a web route. Remove the entry."
        for route in sorted(set(entries) - declared, key=str)
    ]
    for route, entry in entries.items():
        errors += _entry_errors(map_rel, route, entry, mobile_dir)
    return errors


def render_seed(routes: set[str], reason: str) -> str:
    """Return the initial map for a new mobile app: every web route, none built yet."""
    entries = {route: {"not_on_mobile": reason} for route in sorted(routes)}
    return yaml.safe_dump({"routes": entries}, sort_keys=False, allow_unicode=True)


def _cli() -> int:
    parser = argparse.ArgumentParser(prog="platform_shared.infra.screen_map")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--app", help="App slug (matches apps/<slug>/app.yaml)")
    group.add_argument("--all", action="store_true", help="Check every app under apps/")
    args = parser.parse_args()

    repo_root = _render._repo_root()
    slugs = _render._list_apps(repo_root) if args.all else [args.app]
    errors = [error for slug in slugs for error in check_app(repo_root, slug)]
    for error in errors:
        print(error, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(_cli())
