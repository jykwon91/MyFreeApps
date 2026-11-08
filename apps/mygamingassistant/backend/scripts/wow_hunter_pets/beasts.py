"""Tamable beasts, for ``/wow-forever/hunter-pets`` (pure).

Classic side (cmangos classic-db): a beast is a ``creature_template`` of
``CreatureType`` 1 whose ``CreatureTypeFlags`` bit 0 (tameable) is set and whose
family is one of the page's. What it teaches is its ``PetSpellDataId`` looked up
in the Classic Era client's ``CreatureSpellData`` (the ability rank spell ids);
zones are the three places it spawns most (continents through the World Map
placement, instance maps by name).

Forever side (the operator's creature cache): the beasts the client has met,
including ones cmangos doesn't know.
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


def seen_beasts(cache: CreatureCache, family_ids: set[int]) -> list[CachedCreature]:
    """Every tamable beast of the page's families the Forever client has met, by name then id."""
    found = [
        c for c in cache.creatures.values()
        if c.creature_type == BEAST_TYPE and c.tameable and c.family in family_ids and c.name != GENERIC_PET_NAME
    ]
    return sorted(found, key=lambda c: (c.name, c.creature_id))
