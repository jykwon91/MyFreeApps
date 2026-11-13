"""Build the quests of WoW Forever's own dungeons (the Dungeons pages' Quests section).

Usage (from ``apps/mygamingassistant/backend``)::

    python -m scripts.wow_forever_quests.build

Reads Blizzard's Game Data API (``static-forever-us``; needs
``BLIZZARD_CLIENT_ID`` / ``BLIZZARD_CLIENT_SECRET`` in ``backend/.env``) — the
source of truth for Forever — plus the World Map's committed
``foreverDungeons.json`` (which dungeons) and the pinned client's ``AreaTable``
(which quest areas lie on each dungeon's map). Writes
``data/dungeons/foreverDungeonQuests.json``: ``build``, ``columns`` and, per
instance id, its quest rows (``quests.COLUMNS``), by quest id.

Game data © Blizzard Entertainment. Never hand-edit the output.
"""
from __future__ import annotations

import json
from collections.abc import Iterable, Mapping, Sequence
from typing import Any, Protocol

from scripts.wow_forever_quests.paths import FOREVER_DUNGEON_QUESTS_FILE, FOREVER_DUNGEONS_FILE
from scripts.wow_forever_quests.quests import COLUMNS, dungeon_areas, is_dungeon_quest, quest_row
from scripts.wow_gear.build import write_json
from scripts.wow_talents.blizzard_api import BlizzardStatic, blizzard_credentials, namespace_build
from scripts.wow_world_map import sources


class GameData(Protocol):
    def get(self, url: str) -> dict[str, Any]: ...


def collect_quests(
    api: GameData,
    dungeons: Sequence[tuple[int, str]],
    quest_areas: Iterable[Mapping[str, Any]],
    area_rows: Iterable[Mapping[str, str]],
) -> dict[str, list[list[object]]]:
    """Each dungeon's Dungeon-typed quests (by instance id, rows sorted by quest id)."""
    areas = dungeon_areas(dungeons, quest_areas, area_rows)
    quests: dict[str, list[list[object]]] = {}
    for instance, name in dungeons:
        rows: dict[int, list[object]] = {}
        for area in areas[instance]:
            for entry in api.get(f"/data/wow/quest/area/{area}").get("quests") or []:
                quest = api.get(f"/data/wow/quest/{int(entry['id'])}")
                if is_dungeon_quest(quest):
                    rows[int(quest["id"])] = quest_row(quest)
        if not rows:
            raise SystemExit(f"Blizzard's quest areas list no Dungeon quests for {name} — check the area match.")
        quests[str(instance)] = [rows[q] for q in sorted(rows)]
    return quests


def main() -> None:
    dungeons_doc = json.loads(FOREVER_DUNGEONS_FILE.read_text(encoding="utf-8"))
    at = {c: i for i, c in enumerate(dungeons_doc["columns"])}
    dungeons = [(int(r[at["instance"]]), str(r[at["name"]])) for r in dungeons_doc["rows"]]
    with BlizzardStatic(*blizzard_credentials()) as api:
        index = api.get("/data/wow/quest/area/index")
        quests = collect_quests(api, dungeons, index["areas"], sources.wago_table("AreaTable"))
    build = namespace_build(index["_links"]["self"]["href"])
    write_json(FOREVER_DUNGEON_QUESTS_FILE, {
        "source": "Blizzard Game Data API (static-forever-us): quest areas and quests. Game data (c) Blizzard Entertainment.",
        "build": build,
        "columns": COLUMNS,
        "quests": quests,
    })
    total = sum(len(v) for v in quests.values())
    print(f"wrote {total} quests for {len(quests)} Forever dungeons (build {build}) to {FOREVER_DUNGEON_QUESTS_FILE}")


if __name__ == "__main__":
    main()
