"""Drop chances from cmangos loot tables, the way the server rolls them.

Follows cmangos ``LootTemplate::Process`` and ``LootGroup::Roll``
(mangos-classic ``src/game/Loot/LootMgr.cpp``):

* A row's chance is a percent. A negative one is a quest drop (``needs_quest``):
  it rolls at the same size but only shows to someone on the quest.
* Rows in group 0 roll on their own, each independently.
* Rows sharing a group > 0 are one roll that gives at most one of them. The rows
  with a chance (quest drops included) are walked in a shuffled order, each
  taking its chance out of one 0-100 roll; when the roll misses them all, one of
  the chance-0 rows is picked at random, so those split what is left of 100%
  equally (Hand of Justice is one of eleven equal rows in Emperor Thaurissan's
  group). When the chances add up past 100%, which row wins depends on the
  shuffle (Rhahk'Zor's 95% hammer shares a group with 17.5% of other rows):
  ``_shuffled_shares`` works out the exact average, and chance-0 rows never drop.
* A row whose ``mincountOrRef`` is negative points at a reference table. It
  rolls its chance once (or is the row its group picks), then the referenced
  table is processed ``maxcount`` times.
* Rows the server drops at load are left out: ``mincountOrRef`` 0, a reference
  with a negative chance, a chance-0 row outside a group.

A reference that many creatures share is a "world drop" pool (random greens and
blues of a level range), not any one creature's loot: callers pass those as
``skip``, and ``table_drops`` reports them as one "any world drop" chance.

Not modelled: a row's ``condition_id`` (callers filter the rows on conditions
they can resolve, such as the player's faction), and the equal-chance pick's 50%
re-pick of an item already in the loot. Pure functions over the dump's rows;
tested in ``tests/test_wow_item_pages_generator.py`` and
``tests/test_wow_mob_drops_generator.py``.
"""
from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from math import comb
from typing import Any

Row = Mapping[str, Any]

# A reference this many creature loot tables point at is a world-drop pool.
WORLD_POOL_USERS = 10
MAX_REFERENCE_DEPTH = 4
FULL_ROLL = 100.0
# Subset sums are bucketed to this many decimals while averaging over shuffles.
SUM_DIGITS = 6

Key = tuple[int, bool, int]
"""One drop: (item id, quest drop, condition id)."""
# table_drops' key for "any item from a skipped world-drop pool".
WORLD_DROP: Key = (0, False, 0)


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


def _loaded(row: Row) -> bool:
    """False for the rows cmangos drops when it loads a loot table."""
    ref, chance = as_int(row["mincountOrRef"]), as_float(row["ChanceOrQuestChance"])
    if ref == 0 or (ref < 0 and chance < 0):
        return False
    return not (chance == 0 and as_int(row["groupid"]) == 0)


def _shuffled_shares(chances: list[float]) -> list[float]:
    """Each row's chance (0..1) to be the one its group gives, for explicit chances adding up past 100%.

    The server shuffles the rows and walks them, taking each chance out of one roll in 0-100, so a
    row whose rows ahead add up to ``before`` wins when the roll lands in [before, before + chance).
    Averaged over every order: the rows ahead are a subset of the others, each size equally likely
    and each subset of a size equally likely.
    """
    n = len(chances)
    shares: list[float] = []
    for i, chance in enumerate(chances):
        others = chances[:i] + chances[i + 1:]
        # subsets[k] = {sum of k other rows, capped at 100: how many k-subsets add up to it}
        subsets: list[dict[float, int]] = [defaultdict(int) for _ in range(n)]
        subsets[0][0.0] = 1
        for other in others:
            for k in range(len(others) - 1, -1, -1):
                for total, count in list(subsets[k].items()):
                    subsets[k + 1][round(min(FULL_ROLL, total + other), SUM_DIGITS)] += count
        share = 0.0
        for k, sums in enumerate(subsets):
            weight = 1.0 / (n * comb(n - 1, k))
            for before, count in sums.items():
                share += weight * count * max(0.0, min(chance, FULL_ROLL - before))
        shares.append(share / FULL_ROLL)
    return shares


def _group_chances(rows: list[Row]) -> list[tuple[Row, float]]:
    """One group's rows, each with the chance (0..1) that the group's one roll gives it."""
    explicit = [r for r in rows if as_float(r["ChanceOrQuestChance"]) != 0]
    equal = [r for r in rows if as_float(r["ChanceOrQuestChance"]) == 0]
    chances = [min(abs(as_float(r["ChanceOrQuestChance"])), FULL_ROLL) for r in explicit]
    total = sum(chances)
    if total <= FULL_ROLL:
        out = [(r, c / FULL_ROLL) for r, c in zip(explicit, chances)]
        left = (FULL_ROLL - total) / FULL_ROLL
    else:
        out = list(zip(explicit, _shuffled_shares(chances)))
        left = 0.0
    return out + [(r, left / len(equal)) for r in equal]


def _row_chances(rows: list[Row]) -> list[tuple[Row, float]]:
    """Each row the server loads, with the chance (0..1) one loot rolls it; quest drops included."""
    groups: dict[int, list[Row]] = defaultdict(list)
    out: list[tuple[Row, float]] = []
    for row in rows:
        if not _loaded(row):
            continue
        group = as_int(row["groupid"])
        if group > 0:
            groups[group].append(row)
        else:
            out.append((row, min(abs(as_float(row["ChanceOrQuestChance"])), FULL_ROLL) / FULL_ROLL))
    for group in sorted(groups):
        out += _group_chances(groups[group])
    return out


def _either(a: float, b: float) -> float:
    """The chance of getting it from either of two independent rolls."""
    return 1.0 - (1.0 - a) * (1.0 - b)


def _repeated(chance: float, inner: float, rolls: int) -> float:
    """A reference row rolled with ``chance``, then processed ``rolls`` times, each giving it with ``inner``."""
    return chance * (1.0 - (1.0 - inner) ** rolls)


def any_drop_chance(rows: Iterable[Row], references: Mapping[int, list[Row]], depth: int = 0) -> float:
    """The chance (0..1) one loot of these rows gives at least one item; quest drops left out."""
    miss = 1.0
    groups: dict[int, float] = defaultdict(float)
    for row, chance in _row_chances(list(rows)):
        ref = as_int(row["mincountOrRef"])
        if ref < 0:
            if depth >= MAX_REFERENCE_DEPTH:
                continue
            inner = any_drop_chance(references.get(-ref, []), references, depth + 1)
            got = _repeated(chance, inner, max(1, as_int(row.get("maxcount"))))
        else:
            got = 0.0 if as_float(row["ChanceOrQuestChance"]) < 0 else chance
        group = as_int(row["groupid"])
        if group > 0:
            groups[group] += got
        else:
            miss *= 1.0 - got
    for got in groups.values():
        miss *= 1.0 - min(1.0, got)
    return 1.0 - miss


def table_drops(
    rows: Iterable[Row],
    references: Mapping[int, list[Row]],
    skip: set[int] = frozenset(),  # type: ignore[assignment]
    depth: int = 0,
) -> dict[Key, float]:
    """Drop -> chance (0..1) one loot of these rows gives it, following references not in ``skip``.

    A quest drop's chance is its chance while on the quest. The references in ``skip`` (world-drop
    pools) come back as one ``WORLD_DROP`` chance: any item from any of them.
    """
    found: dict[Key, float] = {}
    grouped: dict[int, dict[Key, float]] = defaultdict(lambda: defaultdict(float))
    for row, chance in _row_chances(list(rows)):
        ref = as_int(row["mincountOrRef"])
        if ref < 0:
            if depth >= MAX_REFERENCE_DEPTH:
                continue
            rolls = max(1, as_int(row.get("maxcount")))
            referenced = references.get(-ref, [])
            if -ref in skip:
                inner = {WORLD_DROP: any_drop_chance(referenced, references, depth + 1)}
            else:
                inner = table_drops(referenced, references, skip, depth + 1)
            got = {key: _repeated(chance, p, rolls) for key, p in inner.items()}
        else:
            quest = as_float(row["ChanceOrQuestChance"]) < 0
            got = {(as_int(row["item"]), quest, as_int(row.get("condition_id"))): chance}
        group = as_int(row["groupid"])
        for key, p in got.items():
            if group > 0:
                # A group's roll gives one of its rows, so the rows' chances add up.
                grouped[group][key] += p
            else:
                found[key] = _either(found.get(key, 0.0), p)
    for drops in grouped.values():
        for key, p in drops.items():
            found[key] = _either(found.get(key, 0.0), min(1.0, p))
    return found


def table_chances(
    rows: Iterable[Row],
    references: Mapping[int, list[Row]],
    skip: set[int] = frozenset(),  # type: ignore[assignment]
    depth: int = 0,
) -> dict[int, float]:
    """Item id -> chance (0..1) one loot of these rows gives it, following references not in ``skip``.

    Quest drops and the skipped pools are left out: they never count as a way to get gear.
    """
    found: dict[int, float] = {}
    for (item, quest, _condition), chance in table_drops(rows, references, skip, depth).items():
        if item and not quest and chance > 0:
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
