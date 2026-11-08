"""Build the WoW Forever icon map: the client icon of every item / spell the pages show.

    python -m scripts.wow_icons.build --hotfix-cache "<Forever>/_forever_/Cache/ADB/enUS/DBCache.bin"

Reads the generated Professions data (run ``scripts.wow_professions.build``
first), the gathering guides' node items, the hand-written Cooking guide's
ingredients, the dungeon quests' reward items (``scripts.wow_dungeons.build``)
the talent calculator's icons (``scripts.wow_talents.build``), the downrank
calculator's spell-family icons (``scripts.wow_downrank.build``) and the races
page's racial icons (``scripts.wow_races.build``), looks each id up in the Forever
client tables (pinned build, ``scripts/wow_world_map/sources.py``) and writes
``frontend/src/games/wow-forever/data/icons/wowIcons.json``::

    {"source": ..., "build": "1.60.1.70790",
     "items": {"2447": [133939, 1], ...},   # item id -> [icon file id, quality]
     "spells": {"7418": 135913, ...},       # spell id -> icon file id
     "files": [132152, ...]}                # icon files a page names directly (talents, downrank, spellbook, races)

The frontend joins names to icons by id; the images themselves are published
by ``python -m scripts.wow_icons.publish`` (never committed). Game data and
icons © Blizzard Entertainment.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_icons.ids import (
    IconIds,
    appearance_icon_map,
    crafting_file_ids,
    icon_file_ids,
    item_icons,
    spell_icons,
    talent_file_ids,
)
from scripts.wow_items.forever_items import hotfix_cache_path, load_forever_item_tables
from scripts.wow_world_map.sources import WAGO_BRANCH, WAGO_BUILD, wago_table

CLASS_DETAILS_FILE = WOW_DATA_DIR / "classes" / "classDetails.json"
CRAFTING_DIR = WOW_DATA_DIR / "professions" / "crafting"
GATHERING_DIR = WOW_DATA_DIR / "professions" / "gathering"
ITEMS_FILE = WOW_DATA_DIR / "items" / "items.json"
COOKING_FILE = WOW_DATA_DIR / "professions" / "cooking.ts"
DUNGEON_QUEST_FILES = (
    WOW_DATA_DIR / "dungeons" / "classic" / "dungeonQuests.json",
    WOW_DATA_DIR / "dungeons" / "dungeonQuestsSeen.json",
)
QUEST_REWARD_ITEMS_FILE = WOW_DATA_DIR / "quests" / "questRewardItems.json"
TALENTS_DIR = WOW_DATA_DIR / "talents"
DOWNRANK_FILE = WOW_DATA_DIR / "downrank" / "spells.json"
SPELLBOOK_DIR = WOW_DATA_DIR / "spellbook"
RACES_FILE = WOW_DATA_DIR / "races" / "races.json"
HUNTER_PETS_FILE = WOW_DATA_DIR / "hunterPets" / "hunterPets.json"
RARE_SPAWNS_FILE = WOW_DATA_DIR / "rares" / "classic" / "rareSpawns.json"
OUT_FILE = WOW_DATA_DIR / "icons" / "wowIcons.json"
# Hand-written gathering nodes name their item as `itemId: 2447`.
_NODE_ITEM = re.compile(r"\bitemId:\s*(\d+)")
# The hand-written Cooking guide names each ingredient as `{ id: 2672, name: "Stringy Wolf Meat" }`.
_MAT_ITEM = re.compile(r"\{\s*id:\s*(\d+),\s*name:")
# The comma between two map entries: after `]` (an item) or a digit (a spell), before a quoted id.
_ENTRY_BREAK = re.compile(r'([\]\d]),"(?=\d)')


def gathering_item_ids(directory: Path = GATHERING_DIR) -> set[int]:
    """The herb / ore items the gathering guides' node lists name."""
    ids: set[int] = set()
    for path in sorted(directory.glob("*.ts")):
        ids |= {int(m) for m in _NODE_ITEM.findall(path.read_text(encoding="utf-8"))}
    return ids


def cooking_item_ids(path: Path = COOKING_FILE) -> set[int]:
    """The ingredients the hand-written Cooking guide lists."""
    return {int(m) for m in _MAT_ITEM.findall(path.read_text(encoding="utf-8"))}


def write_icon_map(path: Path, payload: dict[str, Any]) -> None:
    """The map as JSON with one id per line, so a client update's diff shows which icons moved."""
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    text = _ENTRY_BREAK.sub(r'\1,\n"', text)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def gear_item_ids(path: Path = ITEMS_FILE) -> set[int]:
    """Every item ``items.json`` lists: what Best gear, Item Compare and the item pages name."""
    return {int(row[0]) for row in json.loads(path.read_text(encoding="utf-8"))["items"]}


def dungeon_quest_item_ids(paths: tuple[Path, ...] = DUNGEON_QUEST_FILES) -> set[int]:
    """The reward items the dungeon pages' Quests sections name (Classic and seen in game)."""
    ids: set[int] = set()
    for path in paths:
        doc = json.loads(path.read_text(encoding="utf-8"))
        columns = doc.get("questColumns") or doc["columns"]
        at_rewards, at_choices = columns.index("rewards"), columns.index("choices")
        for row in doc["quests"].values():
            ids |= {int(item) for item, _ in row[at_rewards] + row[at_choices]}
    return ids


def quest_database_item_ids(path: Path = QUEST_REWARD_ITEMS_FILE) -> set[int]:
    """The reward items the quest database pages name (``scripts.wow_quests.build``)."""
    if not path.exists():
        return set()
    return {int(k) for k in json.loads(path.read_text(encoding="utf-8"))["items"]}


def rare_drop_item_ids(path: Path = RARE_SPAWNS_FILE) -> set[int]:
    """The items the rares finder names as a rare's drops."""
    rares = json.loads(path.read_text(encoding="utf-8"))["rares"].values()
    return {int(item) for rare in rares for item, _ in rare["drops"]}


def talent_icon_files(directory: Path = TALENTS_DIR) -> set[int]:
    """The talent calculator's icons: they're file ids already (``scripts.wow_talents.build``)."""
    return talent_file_ids(json.loads(p.read_text(encoding="utf-8")) for p in sorted(directory.glob("*.json")))


def downrank_icon_files(path: Path = DOWNRANK_FILE) -> set[int]:
    """The downrank calculator's spell-family icons: file ids already (``scripts.wow_downrank.build``)."""
    return {f["icon"] for f in json.loads(path.read_text(encoding="utf-8"))["families"] if f["icon"]}


def spellbook_icon_files(directory: Path = SPELLBOOK_DIR) -> set[int]:
    """The spellbook's spell icons: file ids already (``scripts.wow_spellbook.build``)."""
    return {
        spell["icon"]
        for path in sorted(directory.glob("*.json"))
        for spell in json.loads(path.read_text(encoding="utf-8"))["spells"]
        if spell["icon"]
    }


def race_icon_files(path: Path = RACES_FILE) -> set[int]:
    """The races page's racial icons: file ids already (``scripts.wow_races.build``)."""
    races = json.loads(path.read_text(encoding="utf-8"))["races"]
    return {r["icon"] for race in races for r in race["racials"] if r["icon"]}


def class_icon_files(path: Path = CLASS_DETAILS_FILE) -> set[int]:
    """The class pages' icons: IconFileDataID from ChrClasses (``scripts.wow_classes.build``)."""
    classes = json.loads(path.read_text(encoding="utf-8"))["classes"]
    return {int(detail["icon"]) for detail in classes.values() if detail.get("icon")}


def hunter_pet_icon_files(path: Path = HUNTER_PETS_FILE) -> set[int]:
    """The Hunter pets page's family and ability icons: file ids already (``scripts.wow_hunter_pets.build``)."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    return {f["icon"] for f in doc["families"] if f["icon"]} | {a["icon"] for a in doc["abilities"] if a["icon"]}


def wanted_ids() -> IconIds:
    ids = IconIds(
        items=gathering_item_ids() | cooking_item_ids() | gear_item_ids() | dungeon_quest_item_ids() | quest_database_item_ids() | rare_drop_item_ids(),
        files=talent_icon_files() | downrank_icon_files() | spellbook_icon_files() | race_icon_files() | class_icon_files() | hunter_pet_icon_files(),
    )
    for path in sorted(CRAFTING_DIR.glob("*.json")):
        ids.update(crafting_file_ids(json.loads(path.read_text(encoding="utf-8"))))
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the WoW Forever icon map.")
    parser.add_argument("--hotfix-cache", help="the Forever client's Cache/ADB/enUS/DBCache.bin")
    cache_path = hotfix_cache_path(parser.parse_args().hotfix_cache)
    ids = wanted_ids()
    print(f"Loading icon tables from wago.tools ({WAGO_BRANCH} {WAGO_BUILD})...")
    forever = load_forever_item_tables(cache_path)
    appearance = appearance_icon_map(
        wago_table("ItemModifiedAppearance", hotfixes=True), wago_table("ItemAppearance", hotfixes=True)
    )
    items, missing_items = item_icons(ids.items, forever.item.values(), forever.sparse, appearance)
    spells, missing_spells = spell_icons(ids.spells, wago_table("SpellMisc"))
    payload = {
        "source": f"{forever.source}. Icons © Blizzard Entertainment.",
        "build": WAGO_BUILD,
        "items": {str(k): list(v) for k, v in items.items()},
        "spells": {str(k): v for k, v in spells.items()},
        "files": sorted(ids.files),
    }
    write_icon_map(OUT_FILE, payload)
    print(
        f"wrote {OUT_FILE.name}: {len(items)} items, {len(spells)} spells, "
        f"{len(icon_file_ids(payload))} distinct icons"
    )
    # A name with no icon gets the frontend's placeholder; say which, so a client change is noticed.
    if missing_items or missing_spells:
        print(f"  no icon: items {missing_items[:20]} spells {missing_spells[:20]}")


if __name__ == "__main__":
    main()
