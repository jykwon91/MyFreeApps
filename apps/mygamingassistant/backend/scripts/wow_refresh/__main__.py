"""Refresh the WoW Forever data from the newest client build.

Run from ``apps/mygamingassistant/backend``::

    python -m scripts.wow_refresh check             # is there a newer build?
    python -m scripts.wow_refresh apply             # pin it, regenerate, report
    python -m scripts.wow_refresh apply --art       # also redraw the map art
    python -m scripts.wow_refresh report            # what changed against git HEAD

``check`` exits 0 when the data is current and 10 when a newer build exists.
Walk graphs are never rebuilt here: they need a few GB of client files, so run
``python -m scripts.wow_world_map.walk`` by hand when terrain or buildings
change. See ``apps/mygamingassistant/docs/wow-forever-refresh.md``.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

from scripts.wow_refresh.report import render_report
from scripts.wow_world_map import sources

BACKEND_DIR = Path(__file__).resolve().parents[2]
APP_DIR = BACKEND_DIR.parent
SOURCES_FILE = BACKEND_DIR / "scripts" / "wow_world_map" / "sources.py"
BUILDS_URL = "https://wago.tools/api/builds"
EXIT_NEW_BUILD = 10


def newest_build(builds: dict[str, list[dict[str, str]]], branch: str) -> str:
    """The most recently published build of a branch. Fails loudly when the
    branch is gone, because a renamed branch would otherwise look like "no
    update" for ever."""
    published = builds.get(branch)
    if not published:
        raise SystemExit(f"wago.tools lists no builds for branch {branch!r}: has it been renamed?")
    return max(published, key=lambda b: b["created_at"])["version"]


def repin(text: str, *, build: str, era_build: str) -> str:
    """``sources.py`` with its two client builds replaced."""
    for name, value in (("WAGO_BUILD", build), ("WAGO_ERA_BUILD", era_build)):
        text, count = re.subn(rf'^{name} = "[^"]+"$', f'{name} = "{value}"', text, flags=re.M)
        if count != 1:
            raise SystemExit(f"could not find {name} in {SOURCES_FILE}")
    return text


def fetch_builds() -> dict[str, list[dict[str, str]]]:
    request = urllib.request.Request(BUILDS_URL, headers={"User-Agent": sources._USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def generators(*, art: bool) -> list[list[str]]:
    world_map = ["scripts.wow_world_map.build", "--no-walk"]
    if not art:
        world_map.append("--no-art")
    return [
        world_map,
        ["scripts.wow_food.build"],
        ["scripts.wow_professions.build"],
        ["scripts.wow_gold.build"],
        ["scripts.wow_consumables.build"],
        ["scripts.wow_items.build"],
        ["scripts.wow_item_names.build"],
        ["scripts.wow_warlock.build"],
        ["scripts.wow_class_spells.build"],
        # Reads the World Map, Professions and Item output above, so it runs last.
        ["scripts.wow_gear.build"],
    ]


def check() -> int:
    latest = newest_build(fetch_builds(), sources.WAGO_BRANCH)
    print(f"pinned {sources.WAGO_BUILD}, newest on {sources.WAGO_BRANCH}: {latest}")
    return 0 if latest == sources.WAGO_BUILD else EXIT_NEW_BUILD


def apply(*, art: bool) -> int:
    builds = fetch_builds()
    latest = newest_build(builds, sources.WAGO_BRANCH)
    era = newest_build(builds, sources.WAGO_ERA_BRANCH)
    SOURCES_FILE.write_text(
        repin(SOURCES_FILE.read_text(encoding="utf-8"), build=latest, era_build=era),
        encoding="utf-8",
    )
    print(f"pinned Forever {latest}, Classic Era {era}", flush=True)
    for module in generators(art=art):
        print(f"running {' '.join(module)}", flush=True)
        # Each generator imports the pins at start-up, so each needs its own process.
        subprocess.run([sys.executable, "-m", *module], cwd=BACKEND_DIR, check=True)
    print(render_report(APP_DIR))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the WoW Forever data.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check")
    commands.add_parser("report")
    apply_parser = commands.add_parser("apply")
    apply_parser.add_argument("--art", action="store_true", help="also redraw the map art")
    args = parser.parse_args()
    if args.command == "check":
        return check()
    if args.command == "report":
        print(render_report(APP_DIR))
        return 0
    return apply(art=args.art)


if __name__ == "__main__":
    raise SystemExit(main())
