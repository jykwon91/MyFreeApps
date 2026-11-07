"""Split the item-page data into shards an item page loads one of.

An item's shard is ``id % SHARD_COUNT`` (the frontend's ``itemPageShard``
uses the same constant — a test pins both). Each Classic shard carries only
the zones, quests and instances its own items name. Pure; tested in
``tests/test_wow_item_pages_generator.py``.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

SHARD_COUNT = 64


def shard_of(item_id: int) -> int:
    return item_id % SHARD_COUNT


def split(ids: Iterable[int]) -> list[list[int]]:
    """Item ids per shard, sorted."""
    shards: list[list[int]] = [[] for _ in range(SHARD_COUNT)]
    for item_id in sorted(ids):
        shards[shard_of(item_id)].append(item_id)
    return shards


def _drop_zones(drop: Mapping[str, Any]) -> set[int]:
    zones = {int(z) for z in drop.get("zones", [])}
    return zones | {int(m[4]) for m in drop.get("mobs", []) if m[4] is not None}


def source_zones(record: Mapping[str, Any]) -> set[int]:
    """Every zone id an item's Classic sources point at."""
    zones = {int(v[3]) for v in record.get("vendors", [])}
    if "drop" in record:
        zones |= _drop_zones(record["drop"])
    zones |= {int(s[2]) for s in record.get("objectSpots", []) if s[2] is not None}
    for _, drop in record.get("containerDrops", []):
        zones |= _drop_zones(drop)
    return zones


def classic_shard(
    shard: int,
    ids: list[int],
    sources: Mapping[int, Mapping[str, Any]],
    quests: Mapping[int, list[Any]],
    instances: Mapping[int, list[Any]],
    zone_names: Mapping[int, str],
    territory: Mapping[str, str],
) -> dict[str, Any]:
    """One Classic shard: its items' sources plus the zones, quests and instances they name."""
    items = {i: sources[i] for i in ids if i in sources}
    quest_ids = sorted({q for r in items.values() for q in r.get("quests", [])})
    instance_ids = sorted({int(m[4]) for r in items.values() for m in r.get("instance", {}).get("mobs", [])})
    zones: set[int] = set()
    for record in items.values():
        zones |= source_zones(record)
    for q in quest_ids:
        zones |= {int(g[3]) for g in quests[q][4]}
    zones |= {int(instances[m][5]) for m in instance_ids if instances[m][5] is not None}
    named = sorted(z for z in zones if z in zone_names)
    return {
        "shard": shard,
        "shardCount": SHARD_COUNT,
        "zones": {str(z): zone_names[z] for z in named},
        "territory": {str(z): territory[str(z)] for z in named if str(z) in territory},
        "quests": {str(q): quests[q] for q in quest_ids},
        "instances": {str(m): instances[m] for m in instance_ids},
        "items": {str(i): items[i] for i in sorted(items)},
    }


def forever_shard(
    shard: int,
    ids: list[int],
    rows: Mapping[int, list[Any]],
    facts: Mapping[int, Mapping[str, int]],
    crafted: Mapping[int, list[list[Any]]],
) -> dict[str, Any]:
    """One Forever shard: its items' items.json rows and the client facts (bind, vendor price, crafted-by)."""
    extra: dict[str, dict[str, Any]] = {}
    for i in ids:
        fact: dict[str, Any] = dict(facts.get(i, {}))
        if i in crafted:
            fact["crafted"] = crafted[i]
        if fact:
            extra[str(i)] = fact
    return {
        "shard": shard,
        "shardCount": SHARD_COUNT,
        "items": [rows[i] for i in ids],
        "facts": extra,
    }
