"""Who can go into a dungeon: its group size (Forever client) and what its door asks for (Classic).

Pure functions over table rows; ``build.py`` does the reading and writing.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

ENTRY_COLUMNS = ["trigger", "item", "quest"]


def group_sizes(map_rows: Iterable[Mapping[str, str]], instance_ids: set[int]) -> dict[str, int]:
    """Instance map id -> the most players its instance lets in (Forever ``Map.MaxPlayers``).

    A map the client lists with no cap (0) is left out rather than shown as "0 players".
    """
    out: dict[str, int] = {}
    for row in map_rows:
        map_id = int(row["ID"])
        size = int(row["MaxPlayers"] or 0)
        if map_id in instance_ids and size > 0:
            out[str(map_id)] = size
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))


def entry_requirements(teleports: Iterable[Mapping[str, Any]], instance_ids: set[int]) -> dict[str, list[list[int]]]:
    """Instance map id -> each entrance (area trigger) that needs an item or a finished quest.

    Classic ``areatrigger_teleport``: ``required_item`` / ``required_quest_done``.
    An instance whose doors ask for nothing beyond a level is left out, so an
    empty result means "no key or attunement to go in". The level is not kept:
    the page uses Forever's own.
    """
    out: dict[str, list[list[int]]] = {}
    for row in teleports:
        instance = int(row["target_map"])
        item = int(row.get("required_item") or 0)
        quest = int(row.get("required_quest_done") or 0)
        if instance in instance_ids and (item or quest):
            out.setdefault(str(instance), []).append([int(row["id"]), item, quest])
    for rows in out.values():
        rows.sort()
    return dict(sorted(out.items(), key=lambda kv: int(kv[0])))
