"""Tamable beasts, for ``/wow-forever/hunter-pets`` (pure).

Classic side (cmangos classic-db): a beast is a ``creature_template`` of
``CreatureType`` 1 whose ``CreatureTypeFlags`` bit 0 (tameable) is set and whose
family is one of the page's. What it teaches is its ``PetSpellDataId`` looked up
in the Classic Era client's ``CreatureSpellData`` (the ability rank spell ids);
zones are the three places it spawns most (continents through the World Map
placement, instance maps by name).

Forever side (the operator's creature cache): the beasts the client has met,
including ones cmangos doesn't know, each with the day it was seen. A patch
empties the cache, so beasts an earlier cache met are kept until the client
meets them again (``seen_rows``).
"""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from scripts.wow_rares.creature_cache import CachedCreature, CreatureCache
from scripts.wow_rares.rares import Placer
from scripts.wow_world_map.services import CLASSIC_CONTINENTS

Row = Mapping[str, Any]

BEAST_TYPE = 1
TAMEABLE_FLAG = 1
ZONES_PER_BEAST = 3
# The placeholder the client keeps for "a hunter's pet" — not a beast anyone can tame.
GENERIC_PET_NAME = "Generic Hunter Pet"


@dataclass(frozen=True)
class Beast:
    id: int
    name: str
    family: int
    min_level: int
    max_level: int
    attack_ms: int
    zones: list[str]
    teaches: list[int]


def tamable_templates(templates: Iterable[Row], family_ids: set[int]) -> list[Row]:
    return [
        t for t in templates
        if int(t["CreatureType"]) == BEAST_TYPE
        and int(t["CreatureTypeFlags"]) & TAMEABLE_FLAG
        and int(t["Family"]) in family_ids
    ]


def pet_spell_lists(spell_data: Iterable[Mapping[str, str]]) -> dict[int, list[int]]:
    """CreatureSpellData id -> the spell ids it lists."""
    return {
        int(r["ID"]): [int(r[f"Spells_{k}"]) for k in range(4) if int(r[f"Spells_{k}"] or 0)]
        for r in spell_data
    }


def instance_zone_key(map_id: int) -> str:
    return f"m{map_id}"


def spawn_zones(
    spawns: Iterable[Row],
    beast_ids: set[int],
    event_only: set[int],
    placer: Placer,
) -> dict[int, list[str]]:
    """Beast -> the zone keys it spawns in most (uiMapId on a continent, ``m<map>`` inside an instance)."""
    counts: dict[int, Counter[str]] = {}
    for spawn in spawns:
        beast = int(spawn["id"])
        if beast not in beast_ids or int(spawn["guid"]) in event_only:
            continue
        map_id = int(spawn["map"])
        if map_id in CLASSIC_CONTINENTS:
            spot = placer(map_id, float(spawn["position_x"]), float(spawn["position_y"]))
            if spot is None:
                continue
            key = str(spot[0])
        else:
            key = instance_zone_key(map_id)
        counts.setdefault(beast, Counter())[key] += 1
    return {
        beast: [k for k, _ in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:ZONES_PER_BEAST]]
        for beast, c in counts.items()
    }


def classic_beasts(
    templates: Iterable[Row],
    zones: Mapping[int, list[str]],
    pet_spells: Mapping[int, list[int]],
    ability_spells: set[int],
) -> tuple[list[Beast], list[int]]:
    """The beasts with a spawn, and the ids of those dropped for having none."""
    kept: list[Beast] = []
    dropped: list[int] = []
    for t in sorted(templates, key=lambda t: int(t["Entry"])):
        entry = int(t["Entry"])
        if entry not in zones:
            dropped.append(entry)
            continue
        kept.append(Beast(
            id=entry,
            name=str(t["Name"]),
            family=int(t["Family"]),
            min_level=int(t["MinLevel"]),
            max_level=int(t["MaxLevel"]),
            attack_ms=int(t["MeleeBaseAttackTime"]),
            zones=zones[entry],
            teaches=[s for s in pet_spells.get(int(t["PetSpellDataId"]), []) if s in ability_spells],
        ))
    return kept, dropped


@dataclass(frozen=True)
class SeenBeast:
    creature_id: int
    name: str
    family: int
    # The day the client cache that met it was written (YYYY-MM-DD).
    seen_on: str

    def as_row(self) -> list[object]:
        """``SEEN_COLUMNS`` order (``build.py``)."""
        return [self.creature_id, self.name, self.family, self.seen_on]


def seen_rows(
    cache: CreatureCache, family_ids: set[int], seen_on: str, earlier: Mapping[int, SeenBeast],
) -> list[SeenBeast]:
    """This cache's tamable beasts, plus the ones an earlier file listed that this cache hasn't met
    (a creature it has met as something else is dropped), by name then id."""
    fresh = [SeenBeast(c.creature_id, c.name, c.family, seen_on) for c in seen_beasts(cache, family_ids)]
    carried = [b for cid, b in earlier.items() if cid not in cache.creatures and b.family in family_ids]
    return sorted([*fresh, *carried], key=lambda b: (b.name, b.creature_id))


def earlier_seen_beasts(doc: Mapping[str, Any]) -> dict[int, SeenBeast]:
    """The last ``hunterPets.json``'s seen rows by creature. A file older than the per-beast day
    uses its own ``seenOn``."""
    columns = doc.get("seenColumns")
    rows = doc.get("seen")
    if not isinstance(columns, list) or not isinstance(rows, list):
        return {}
    out: dict[int, SeenBeast] = {}
    for values in rows:
        row = dict(zip(columns, values, strict=True))
        out[int(row["id"])] = SeenBeast(
            int(row["id"]), str(row["name"]), int(row["family"]), str(row.get("seenOn") or doc["seenOn"]),
        )
    return out


def seen_beasts(cache: CreatureCache, family_ids: set[int]) -> list[CachedCreature]:
    """Every tamable beast of the page's families the Forever client has met, by name then id."""
    found = [
        c for c in cache.creatures.values()
        if c.creature_type == BEAST_TYPE and c.tameable and c.family in family_ids and c.name != GENERIC_PET_NAME
    ]
    return sorted(found, key=lambda c: (c.name, c.creature_id))
