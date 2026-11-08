"""Which creatures are rares, where they spawn and what they drop, for ``/wow-forever/rares``.

The list is every Classic rare / rare elite (cmangos classic-db, GPL-3.0:
``creature_template.Rank``) with an open-world spawn, plus every creature the
WoW Forever client calls a rare or rare elite (``creature_cache.py``). A
creature the client has met is "confirmed": its name and classification are
Forever's, and if Forever no longer calls it a rare it is left out. Level,
spawn points and loot are always Classic, because the client has none of them.

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

# creature_template.Rank uses the client's classification codes.
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
    name: str
    classification: int
    min_level: int
    max_level: int
    spawns: list[list[Any]]
    drops: list[list[Any]]

    def as_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "classification": self.classification,
            "minLevel": self.min_level,
            "maxLevel": self.max_level,
            "spawns": self.spawns,
            "drops": self.drops,
        }


def forever_rares(cache: CreatureCache) -> list[CachedCreature]:
    """Every creature the Forever client calls a rare, by name then id."""
    rares = [c for c in cache.creatures.values() if c.classification in RARE_CLASSIFICATIONS]
    return sorted(rares, key=lambda c: (c.name, c.creature_id))


def classic_rare_ids(templates: Mapping[int, Row]) -> set[int]:
    """Every creature Classic ranks rare or rare elite."""
    return {cid for cid, t in templates.items() if as_int(t["Rank"]) in RARE_CLASSIFICATIONS}


def listed_rare_ids(cache: CreatureCache, classic_ids: set[int], spawns: Mapping[int, list[list[Any]]]) -> set[int]:
    """Forever's rares, plus Classic rares with a map spot that the client hasn't shown as something else."""
    forever = {c.creature_id for c in forever_rares(cache)}
    demoted = set(cache.creatures) - forever
    return forever | {cid for cid in classic_ids if spawns.get(cid) and cid not in demoted}


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
    rare_ids: Iterable[int],
    templates: Mapping[int, Row],
    spawns: Mapping[int, list[list[Any]]],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    forever_items: set[int],
) -> dict[int, ClassicRare]:
    """Creature -> Classic name, rank, level range, spots and Forever-item drops; one cmangos doesn't have is left out."""
    out: dict[int, ClassicRare] = {}
    for cid in sorted(rare_ids):
        template = templates.get(cid)
        if template is None:
            continue
        out[cid] = ClassicRare(
            name=str(template["Name"]),
            classification=as_int(template["Rank"]),
            min_level=as_int(template["MinLevel"]),
            max_level=as_int(template["MaxLevel"]),
            spawns=spawns.get(cid, []),
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
