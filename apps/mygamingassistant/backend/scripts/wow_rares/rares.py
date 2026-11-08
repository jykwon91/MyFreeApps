"""Which creatures are rares, where they spawn and what they drop, for ``/wow-forever/rares``.

A rare is a creature the WoW Forever client calls "rare" or "rare elite"
(``creature_cache.py``). Its name and classification are Forever's; its
level, spawn points and loot are cmangos classic-db (GPL-3.0), because the
Forever client has none of them. A creature the Forever client has never
shown is left out, even when Classic calls it a rare.

Pure: the build (``build.py``) passes in the dump's rows and a placer; tests
feed hand-made rows.
"""
from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from scripts.wow_dungeons.boss_loot import creature_drops, drop_rows
from scripts.wow_item_pages.loot_chances import as_int
from scripts.wow_rares.creature_cache import (
    CLASSIFICATION_RARE,
    CLASSIFICATION_RARE_ELITE,
    CachedCreature,
    CreatureCache,
)
from scripts.wow_world_map.services import CLASSIC_CONTINENTS, SAME_SPOT_YARDS

Row = Mapping[str, Any]
# (continent, world x, world y) -> [uiMapId, subzone, x, y], or None off every Classic zone.
Placer = Callable[[int, float, float], list[Any] | None]

RARE_CLASSIFICATIONS = frozenset({CLASSIFICATION_RARE, CLASSIFICATION_RARE_ELITE})
RARE_COLUMNS = ["id", "name", "classification"]
SPAWN_COLUMNS = ["zone", "subzone", "x", "y"]
DROP_COLUMNS = ["item", "chance"]
# A rare's own items roll at 10%+; a shared table of random greens a few
# creatures use (too few to count as a world drop) rolls each item under 1%.
# Only the rare's own items are worth naming.
NOTABLE_DROP_CHANCE = 2.0


@dataclass(frozen=True)
class ClassicRare:
    min_level: int
    max_level: int
    spawns: list[list[Any]]
    drops: list[list[Any]]

    def as_json(self) -> dict[str, Any]:
        return {"minLevel": self.min_level, "maxLevel": self.max_level, "spawns": self.spawns, "drops": self.drops}


def forever_rares(cache: CreatureCache) -> list[CachedCreature]:
    """Every creature the Forever client calls a rare, by name then id."""
    rares = [c for c in cache.creatures.values() if c.classification in RARE_CLASSIFICATIONS]
    return sorted(rares, key=lambda c: (c.name, c.creature_id))


def event_only_guids(game_event_creature: Iterable[Row]) -> set[int]:
    """Spawns that only appear during a seasonal / world event (positive event id)."""
    return {as_int(r["guid"]) for r in game_event_creature if as_int(r["event"]) > 0}


def rare_spawns(
    spawns: Iterable[Row],
    rare_ids: set[int],
    event_only: set[int],
    placer: Placer,
) -> dict[int, list[list[Any]]]:
    """Creature -> its map spots: open world only, no event spawns, spots within SAME_SPOT_YARDS merged."""
    seen: dict[int, list[tuple[float, float]]] = {}
    out: dict[int, list[list[Any]]] = {}
    for spawn in sorted(spawns, key=lambda r: as_int(r["guid"])):
        creature = as_int(spawn["id"])
        continent = as_int(spawn["map"])
        if creature not in rare_ids or continent not in CLASSIC_CONTINENTS or as_int(spawn["guid"]) in event_only:
            continue
        wx, wy = float(str(spawn["position_x"])), float(str(spawn["position_y"]))
        if any(math.hypot(wx - px, wy - py) < SAME_SPOT_YARDS for px, py in seen.get(creature, [])):
            continue
        spot = placer(continent, wx, wy)
        if spot is None:
            continue
        seen.setdefault(creature, []).append((wx, wy))
        out.setdefault(creature, []).append(spot)
    return out


def classic_rares(
    rares: Iterable[CachedCreature],
    templates: Mapping[int, Row],
    spawns: Mapping[int, list[list[Any]]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    forever_items: set[int],
) -> dict[int, ClassicRare]:
    """Creature -> Classic level range, spots and Forever-item drops; a rare cmangos doesn't have is left out."""
    out: dict[int, ClassicRare] = {}
    for rare in rares:
        template = templates.get(rare.creature_id)
        if template is None:
            continue
        out[rare.creature_id] = ClassicRare(
            min_level=as_int(template["MinLevel"]),
            max_level=as_int(template["MaxLevel"]),
            spawns=spawns.get(rare.creature_id, []),
            drops=notable_drops(creature_drops(template, creature_loot, references, pools, forever_items)),
        )
    return out


def notable_drops(drops: Mapping[int, float]) -> list[list[Any]]:
    """[[item, percent], ...] at NOTABLE_DROP_CHANCE or more, most likely first."""
    return drop_rows({item: percent for item, percent in drops.items() if percent >= NOTABLE_DROP_CHANCE})


def drop_item_ids(classic: Mapping[int, ClassicRare]) -> set[int]:
    return {int(row[0]) for rare in classic.values() for row in rare.drops}


def zone_names(classic: Mapping[int, ClassicRare], names: Mapping[int, str]) -> dict[str, str]:
    """uiMapId -> zone name for every zone a rare spawns in."""
    ids = sorted({int(spot[0]) for rare in classic.values() for spot in rare.spawns})
    return {str(i): names[i] for i in ids}
