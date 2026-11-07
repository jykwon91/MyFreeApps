"""Drop chances from cmangos loot tables, the way the server rolls them.

A loot table row has a chance (percent) and a group. Rows in group 0 roll on
their own. Rows sharing a group > 0 are one roll that gives at most one of
them: a row with an explicit chance keeps it, and the rows with chance 0 split
what is left of 100% equally (Hand of Justice is one of eleven equal rows in
Emperor Thaurissan's group). A negative chance is a quest drop — only while on
the quest — so it never counts as a way to get gear.

A row whose ``mincountOrRef`` is negative points at a reference table, rolled
``maxcount`` times at the row's chance. A reference that many creatures share
is a "world drop" pool (random greens and blues of a level range), not any one
creature's loot: its items are reported as world drops instead.

Pure functions over the dump's rows; tested in ``tests/test_wow_item_pages_generator.py``.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any

Row = Mapping[str, Any]

# A reference this many creature loot tables point at is a world-drop pool.
WORLD_POOL_USERS = 10
MAX_REFERENCE_DEPTH = 4


def as_int(value: object) -> int:
    try:
        return int(float(str(value or 0)))
    except ValueError:
        return 0


def as_float(value: object) -> float:
    try:
        return float(str(value or 0))
    except ValueError:
        return 0.0


def loot_index(rows: Iterable[Row]) -> dict[int, list[Row]]:
    index: dict[int, list[Row]] = defaultdict(list)
    for row in rows:
        index[as_int(row["entry"])].append(row)
    return index


def world_pools(creature_loot: Mapping[int, list[Row]], min_users: int = WORLD_POOL_USERS) -> set[int]:
    """References at least ``min_users`` creature loot tables point at."""
    users: dict[int, int] = defaultdict(int)
    for rows in creature_loot.values():
        for ref in {-as_int(r["mincountOrRef"]) for r in rows if as_int(r["mincountOrRef"]) < 0}:
            users[ref] += 1
    return {ref for ref, count in users.items() if count >= min_users}


def _row_chances(rows: list[Row]) -> list[tuple[Row, float]]:
    """Each row with its chance as a fraction, equal-share rows filled in; quest drops and dead rows left out."""
    explicit: dict[int, float] = defaultdict(float)
    equal: dict[int, int] = defaultdict(int)
    for row in rows:
        group, chance = as_int(row["groupid"]), as_float(row["ChanceOrQuestChance"])
        if group > 0:
            if chance > 0:
                explicit[group] += chance
            elif chance == 0:
                equal[group] += 1
    out: list[tuple[Row, float]] = []
    for row in rows:
        group, chance = as_int(row["groupid"]), as_float(row["ChanceOrQuestChance"])
        if chance < 0:
            continue
        if chance == 0:
            if group == 0 or not equal[group]:
                continue
            chance = max(0.0, 100.0 - explicit[group]) / equal[group]
        out.append((row, min(chance, 100.0) / 100.0))
    return out


def _either(a: float, b: float) -> float:
    """The chance of getting it from either of two independent rolls."""
    return 1.0 - (1.0 - a) * (1.0 - b)


def table_chances(
    rows: Iterable[Row],
    references: Mapping[int, list[Row]],
    skip: set[int] = frozenset(),  # type: ignore[assignment]
    depth: int = 0,
) -> dict[int, float]:
    """Item id -> chance (0..1) one loot of these rows gives it, following references not in ``skip``."""
    found: dict[int, float] = {}
    for row, chance in _row_chances(list(rows)):
        ref = as_int(row["mincountOrRef"])
        if ref < 0:
            if -ref in skip or depth >= MAX_REFERENCE_DEPTH:
                continue
            rolls = max(1, as_int(row.get("maxcount")))
            for item, inner in table_chances(references.get(-ref, []), references, skip, depth + 1).items():
                got = 1.0 - (1.0 - chance * inner) ** rolls
                found[item] = _either(found.get(item, 0.0), got)
        else:
            item = as_int(row["item"])
            found[item] = _either(found.get(item, 0.0), chance)
    return found


def drop_index(
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    pools: set[int],
    wanted: set[int],
) -> dict[int, dict[int, float]]:
    """Wanted item -> {creature loot id: percent} — each creature table's own loot, world pools left out."""
    index: dict[int, dict[int, float]] = defaultdict(dict)
    for loot_id, rows in creature_loot.items():
        for item, chance in table_chances(rows, references, pools).items():
            if item in wanted and chance > 0:
                index[item][loot_id] = round(chance * 100.0, 2)
    return index


def pool_items(references: Mapping[int, list[Row]], pools: set[int], wanted: set[int]) -> dict[int, set[int]]:
    """Wanted item -> the world-drop pools that can give it (following nested references)."""
    found: dict[int, set[int]] = defaultdict(set)
    for pool in pools:
        for item in table_chances(references.get(pool, []), references, pools - {pool}):
            if item in wanted:
                found[item].add(pool)
    return found


def pool_users(creature_loot: Mapping[int, list[Row]], pools: set[int]) -> dict[int, set[int]]:
    """World-drop pool -> the creature loot ids that point at it."""
    users: dict[int, set[int]] = defaultdict(set)
    for loot_id, rows in creature_loot.items():
        for row in rows:
            ref = -as_int(row["mincountOrRef"])
            if ref in pools:
                users[ref].add(loot_id)
    return users
