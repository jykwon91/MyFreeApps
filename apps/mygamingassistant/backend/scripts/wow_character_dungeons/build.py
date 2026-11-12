"""Build the character page's dungeon list (``data/wow/character_dungeons.json``).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_character_dungeons.build

Checks every curated statistic id against the Forever client's Achievement
table (it must be a Boss Kills statistic, category 14821) and names each
dungeon's final boss from it, so a client update that moves an id fails here
instead of marking every character "not done". Levels come from the World
Map's ``classicDungeons.json`` (Classic) or the curated ranges (Forever's own).
See ``dungeons.py`` for the curation.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from scripts.wow_character_dungeons.dungeons import DUNGEONS, CuratedDungeon
from scripts.wow_gear.build import WORLD_MAP_CLASSIC, dungeon_levels, write_json
from scripts.wow_world_map import sources

BACKEND_DIR = Path(__file__).resolve().parents[2]
CHARACTER_DUNGEONS_FILE = BACKEND_DIR / "data" / "wow" / "character_dungeons.json"
BOSS_KILLS_CATEGORY = "14821"
# "Edwin VanCleef Kills (Deadmines)" -> "Edwin VanCleef"
_BOSS_TITLE = re.compile(r"^(.+?) kills \(", re.IGNORECASE)


def boss_kill_titles(achievements: list[dict[str, str]]) -> dict[int, str]:
    """Boss Kills statistic id -> the boss it counts."""
    out: dict[int, str] = {}
    for row in achievements:
        if row["Category"] != BOSS_KILLS_CATEGORY:
            continue
        match = _BOSS_TITLE.match(row["Title_lang"])
        if match:
            out[int(row["ID"])] = match.group(1)
    return out


def dungeon_rows(
    curated: tuple[CuratedDungeon, ...], bosses: dict[int, str], levels: dict[int, list[Any]]
) -> list[dict[str, Any]]:
    """One row per dungeon (wing), in level order; fails on an id the client doesn't count as a boss kill."""
    rows = []
    for dungeon in curated:
        missing = [i for i in dungeon.statistic_ids if i not in bosses]
        if missing:
            raise SystemExit(f"{dungeon.name} {dungeon.wing or ''}: {missing} not Boss Kills statistics in this client")
        named = {bosses[i] for i in dungeon.statistic_ids}
        if len(named) > 1:
            raise SystemExit(f"{dungeon.name} {dungeon.wing or ''}: ids name different bosses {sorted(named)}")
        boss = bosses[dungeon.statistic_ids[0]] if dungeon.statistic_ids else dungeon.boss
        if dungeon.instance is not None:
            if dungeon.instance not in levels:
                raise SystemExit(f"{dungeon.name}: instance {dungeon.instance} isn't a World Map dungeon")
            guide_name, level, required = levels[dungeon.instance]
            if guide_name != dungeon.name:
                # The page links the guide by this name's slug.
                raise SystemExit(f"{dungeon.name}: the World Map calls instance {dungeon.instance} {guide_name!r}")
            level_min, level_max = level, level
        elif dungeon.levels is not None:
            (level_min, level_max), required = dungeon.levels, None
        else:
            raise SystemExit(f"{dungeon.name}: needs an instance or a level range")
        rows.append({
            "name": dungeon.name,
            "wing": dungeon.wing,
            # A Classic dungeon, with a guide page on the site.
            "classic": dungeon.instance is not None,
            "boss": boss,
            "statisticIds": list(dungeon.statistic_ids),
            "levelMin": level_min,
            "levelMax": level_max,
            "requiredLevel": required,
        })
    rows.sort(key=lambda r: (r["levelMin"], r["levelMax"], r["name"], r["wing"] or ""))
    return rows


def main() -> None:
    bosses = boss_kill_titles(sources.wago_table("Achievement", hotfixes=True))
    levels = dungeon_levels(json.loads((WORLD_MAP_CLASSIC / "classicDungeons.json").read_text(encoding="utf-8")))
    rows = dungeon_rows(DUNGEONS, bosses, levels)
    write_json(CHARACTER_DUNGEONS_FILE, {"clientBuild": sources.WAGO_BUILD, "dungeons": rows})
    print(f"wrote {len(rows)} dungeons (build {sources.WAGO_BUILD}) to {CHARACTER_DUNGEONS_FILE}")


if __name__ == "__main__":
    main()
