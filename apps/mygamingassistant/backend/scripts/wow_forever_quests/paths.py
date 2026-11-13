"""Where the Forever dungeon-quest build reads and writes (shared with the icon build)."""
from __future__ import annotations

from scripts.wow_food.build import WOW_DATA_DIR

FOREVER_DUNGEONS_FILE = WOW_DATA_DIR / "worldMap" / "foreverDungeons.json"
FOREVER_DUNGEON_QUESTS_FILE = WOW_DATA_DIR / "dungeons" / "foreverDungeonQuests.json"
