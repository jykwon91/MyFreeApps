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
from datetime import UTC, date, datetime
from pathlib import Path

from scripts.wow_dungeons.quest_cache import QUEST_CACHE_ENV, quest_cache_path
from scripts.wow_items.forever_items import HOTFIX_CACHE_ENV, hotfix_cache_path
from scripts.wow_rares.creature_cache import CREATURE_CACHE_ENV, creature_cache_path
from scripts.wow_refresh.report import DATA_REFRESH_FILE, render_report
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
        text, count = re.subn(rf'^{name} = "[^"]+"$', f'{name} = "{value}"', text, flags=re.MULTILINE)
        if count != 1:
            raise SystemExit(f"could not find {name} in {SOURCES_FILE}")
    return text


def write_data_refresh(path: Path, *, build: str, on: date) -> None:
    """The hub's "Game data: patch … · updated …" line, so it is never hand-kept."""
    document = {"clientBuild": build, "refreshedOn": on.isoformat()}
    path.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def fetch_builds() -> dict[str, list[dict[str, str]]]:
    request = urllib.request.Request(BUILDS_URL, headers={"User-Agent": sources._USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def generators(*, art: bool, hotfix_cache: Path, quest_cache: Path, creature_cache: Path) -> list[list[str]]:
    world_map = ["scripts.wow_world_map.build", "--no-walk"]
    cache = ["--hotfix-cache", str(hotfix_cache)]
    if not art:
        world_map.append("--no-art")
    return [
        world_map,
        # Reads the World Map's zones.json. Its images are published last, below.
        ["scripts.wow_satellite.build"],
        ["scripts.wow_food.build"],
        ["scripts.wow_professions.build"],
        ["scripts.wow_gold.build"],
        ["scripts.wow_consumables.build"],
        ["scripts.wow_items.build", *cache],
        # Reads the World Map, Professions and Item output above.
        ["scripts.wow_item_pages.build", *cache],
        ["scripts.wow_talents.build", *cache],
        # Reads the Item and Talent output above (and the World Map's zones).
        ["scripts.wow_changes.build", *cache, "--quest-cache", str(quest_cache)],
        # The item browser's index, beside the item pages: reads the Item output and the Changes feed above.
        ["scripts.wow_item_pages.index"],
        # Reads the Changes output above (a family Forever changed links to it).
        ["scripts.wow_downrank.build", *cache],
        # Reads the Changes and Downrank output above (changed marks, downrank links).
        ["scripts.wow_spellbook.build", *cache],
        # Reads the World Map and Item output above; its drop items are in the icon build's wanted ids.
        ["scripts.wow_rares.build", "--creature-cache", str(creature_cache)],
        # Reads the World Map's zones; its racial icons are in the icon build's wanted ids.
        ["scripts.wow_races.build", *cache],
        # Class icon file ids and resource types; its icons are in the icon build's wanted ids.
        ["scripts.wow_classes.build"],
        # Reads the Professions, Item, Talent, Downrank, Spellbook, Rares, Races and Classes output above. Its images are published last, below.
        ["scripts.wow_icons.build", *cache],
        ["scripts.wow_item_names.build"],
        ["scripts.wow_macros.build"],
        # Reads the World Map, Professions and Item output above, so it runs last.
        ["scripts.wow_gear.build", *cache],
        # The new build's icons must be in R2 before the data naming them ships (needs scripts/.env.r2).
        ["scripts.wow_icons.publish", "--to", "r2"],
        # Same for the World Map's satellite pictures (satellite.json names the build).
        ["scripts.wow_satellite.publish", "--to", "r2"],
    ]


def check() -> int:
    latest = newest_build(fetch_builds(), sources.WAGO_BRANCH)
    print(f"pinned {sources.WAGO_BUILD}, newest on {sources.WAGO_BRANCH}: {latest}")
    return 0 if latest == sources.WAGO_BUILD else EXIT_NEW_BUILD


def apply(*, art: bool, hotfix_cache: str | None, quest_cache: str | None, creature_cache: str | None) -> int:
    # Checked before anything is repinned, so a missing cache stops the run cleanly.
    cache_path = hotfix_cache_path(hotfix_cache)
    quest_path = quest_cache_path(quest_cache)
    creature_path = creature_cache_path(creature_cache)
    builds = fetch_builds()
    latest = newest_build(builds, sources.WAGO_BRANCH)
    era = newest_build(builds, sources.WAGO_ERA_BRANCH)
    SOURCES_FILE.write_text(
        repin(SOURCES_FILE.read_text(encoding="utf-8"), build=latest, era_build=era),
        encoding="utf-8",
    )
    print(f"pinned Forever {latest}, Classic Era {era}", flush=True)
    for module in generators(art=art, hotfix_cache=cache_path, quest_cache=quest_path, creature_cache=creature_path):
        print(f"running {' '.join(module)}", flush=True)
        # Each generator imports the pins at start-up, so each needs its own process.
        subprocess.run([sys.executable, "-m", *module], cwd=BACKEND_DIR, check=True)
    # Only after every generator succeeded, so the hub never claims a refresh that stopped halfway.
    write_data_refresh(APP_DIR / DATA_REFRESH_FILE, build=latest, on=datetime.now(UTC).date())
    print(render_report(APP_DIR))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh the WoW Forever data.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("check")
    commands.add_parser("report")
    apply_parser = commands.add_parser("apply")
    apply_parser.add_argument("--art", action="store_true", help="also redraw the map art")
    apply_parser.add_argument(
        "--hotfix-cache",
        help=f"the Forever client's Cache/ADB/enUS/DBCache.bin (default: ${HOTFIX_CACHE_ENV}, else the install path)",
    )
    apply_parser.add_argument(
        "--quest-cache",
        help=f"the Forever client's Cache/WDB/enUS/questcache.wdb (default: ${QUEST_CACHE_ENV}, else the install path)",
    )
    apply_parser.add_argument(
        "--creature-cache",
        help=f"the Forever client's Cache/WDB/enUS/creaturecache.wdb (default: ${CREATURE_CACHE_ENV}, else the install path)",
    )
    args = parser.parse_args()
    if args.command == "check":
        return check()
    if args.command == "report":
        print(render_report(APP_DIR))
        return 0
    return apply(
        art=args.art, hotfix_cache=args.hotfix_cache, quest_cache=args.quest_cache, creature_cache=args.creature_cache,
    )


if __name__ == "__main__":
    raise SystemExit(main())
