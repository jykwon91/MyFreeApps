"""New quests, zones and maps in Forever (pure).

A quest is new when its ``QuestV2`` id isn't in the Classic Era client. The
client tables carry no quest names, so only quests the operator's own client
has cached (``questcache.wdb``) get a row — badged "Seen in game" with the
day the cache was written; the rest are counted, never guessed.

A zone is a ``UiMap`` row the Classic Era client doesn't have; a map is a
``Map`` row likewise (a new dungeon, battleground or world map), unless a new
zone already has its name. Zones the World Map shows link to it.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping

from scripts.wow_changes.entry import KIND_NEW, PROVENANCE_SEEN, Change
from scripts.wow_dungeons.quest_cache import CachedQuest

Row = Mapping[str, str]

# UiMap.Type
UI_MAP_KIND = {1: "world map", 2: "continent", 3: "zone", 4: "dungeon map", 5: "area", 6: "area"}
# Map.InstanceType
MAP_KIND = {0: "world map", 1: "dungeon", 2: "raid", 3: "battleground", 4: "arena"}
# Rows the client carries with a developer's name, not a place.
PLACEHOLDER_MAP_NAMES = frozenset({"nothing to see here"})
NO_PARENT = 0


def _int(value: str | None) -> int:
    return int(value or 0)


def quest_changes(
    forever_ids: Iterable[int],
    classic_ids: set[int],
    cached: Mapping[int, CachedQuest],
    seen_on: str,
) -> tuple[list[Change], int]:
    """The new quests the client cache names, and how many new quests it doesn't."""
    out = []
    unnamed = 0
    for quest_id in sorted(set(forever_ids) - classic_ids):
        quest = cached.get(quest_id)
        if quest is None or not quest.title.strip():
            unnamed += 1
            continue
        level = f", level {quest.level}" if quest.level > 0 else ""
        start = f" (from level {quest.min_level})" if quest.min_level > 0 else ""
        out.append(Change(
            key=f"quest:{quest_id}",
            kind=KIND_NEW,
            name=quest.title.strip(),
            summary=f"New quest{level}{start}.",
            link=("quest", quest_id),
            provenance=PROVENANCE_SEEN,
            seen_on=seen_on,
        ))
    return sorted(out, key=lambda c: c.name), unnamed


def zone_changes(
    forever_ui_maps: Iterable[Row],
    classic_ui_map_ids: set[int],
    forever_maps: Iterable[Row],
    classic_map_ids: set[int],
    world_map_ids: set[int],
) -> list[Change]:
    """New UiMap zones first, then new Map rows whose name no new zone has."""
    out: list[Change] = []
    names: set[str] = set()
    ui_maps = sorted(
        (r for r in forever_ui_maps if _int(r["ID"]) not in classic_ui_map_ids),
        # A row with a parent wins over a same-named orphan.
        key=lambda r: (_int(r["ParentUiMapID"]) == NO_PARENT, _int(r["ID"])),
    )
    for row in ui_maps:
        name = (row.get("Name_lang") or "").strip()
        ui_map = _int(row["ID"])
        if not name or name in names:
            continue
        names.add(name)
        kind = UI_MAP_KIND.get(_int(row.get("Type")), "map")
        out.append(Change(
            key=f"zone:{ui_map}",
            kind=KIND_NEW,
            name=name,
            summary=f"New {kind}.",
            link=("map", ui_map) if ui_map in world_map_ids else None,
        ))
    for row in sorted(forever_maps, key=lambda r: _int(r["ID"])):
        name = (row.get("MapName_lang") or "").strip()
        if _int(row["ID"]) in classic_map_ids or not name or name in names or name.lower() in PLACEHOLDER_MAP_NAMES:
            continue
        names.add(name)
        kind = MAP_KIND.get(_int(row.get("InstanceType")), "map")
        out.append(Change(key=f"map:{_int(row['ID'])}", kind=KIND_NEW, name=name, summary=f"New {kind}."))
    return out
