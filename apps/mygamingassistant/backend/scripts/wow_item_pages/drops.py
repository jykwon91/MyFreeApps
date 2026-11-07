"""Which mobs to list for an item, most practical first.

Pure: the finder (``finder.py``) gives each function the chances and
creature rows; tests feed hand-made rows.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from typing import Any

from scripts.wow_item_pages.loot_chances import as_int

Row = Mapping[str, Any]

# creature_template.Rank: 0 normal, 1 elite, 2 rare elite, 3 boss, 4 rare.
RANK_BOSS = 3
RARE_RANKS = frozenset({2, 4})
INSTANCE_DUNGEON = 1
INSTANCE_RAID = 2

# Chance bands (percent): near-equal chances stay in one band, so level or boss decides between them.
CHANCE_BANDS = (15.0, 5.0)
# Below these a drop is noise next to a likelier one (the expert's cut), unless nothing drops it more often.
MIN_BOSS_CHANCE = 0.5
MIN_MOB_CHANCE = 1.0
SHOWN_INSTANCE_MOBS = 6
SHOWN_WORLD_MOBS = 6

# An instance drop row's "kind": a boss, a rare spawn, or "" (trash).
KIND_BOSS = "boss"
KIND_RARE = "rare"
INSTANCE_COLUMNS = ["name", "minLevel", "maxLevel", "chance", "instance", "kind"]


def chance_band(chance: float) -> int:
    """0 for the likeliest band, then 1, 2 …"""
    for band, floor in enumerate(CHANCE_BANDS):
        if chance >= floor:
            return band
    return len(CHANCE_BANDS)


def instance_kind(template: Row, named_bosses: set[str]) -> str:
    """A boss (rank boss, or a Forever DungeonEncounter names it), a rare, or trash ("")."""
    rank = as_int(template.get("Rank"))
    if rank == RANK_BOSS or str(template["Name"]) in named_bosses:
        return KIND_BOSS
    return KIND_RARE if rank in RARE_RANKS else ""


def shown_by_chance(chances: Mapping[int, float], floor: Callable[[int], float]) -> list[int]:
    """The npcs at or over their floor; when none is, the likeliest one alone."""
    shown = [npc for npc, chance in chances.items() if chance >= floor(npc)]
    if shown or not chances:
        return shown
    return [max(chances, key=lambda n: (chances[n], -n))]


def instance_drops(
    chances: Mapping[int, float],
    templates: Mapping[int, Row],
    maps_of: Callable[[Row], set[int]],
    instance_types: Mapping[int, int],
    encounters: Mapping[int, set[str]],
) -> dict[str, Any] | None:
    """Mobs inside dungeons and raids that drop it: ``{"mobs": INSTANCE_COLUMNS rows, "more": n}``.

    Sorted by chance band, then bosses before trash, then the higher chance.
    Bosses down to MIN_BOSS_CHANCE, trash and rares down to MIN_MOB_CHANCE.
    """
    rows: dict[int, list[Any]] = {}
    for npc, chance in chances.items():
        template = templates.get(npc)
        if template is None:
            continue
        maps = sorted(m for m in maps_of(template) if instance_types.get(m) in (INSTANCE_DUNGEON, INSTANCE_RAID))
        if not maps:
            continue
        kind = instance_kind(template, encounters.get(maps[0], set()))
        rows[npc] = [
            str(template["Name"]), as_int(template["MinLevel"]), as_int(template["MaxLevel"]),
            round(chance, 1), maps[0], kind,
        ]
    if not rows:
        return None
    in_reach = {npc: chances[npc] for npc in rows}
    shown = shown_by_chance(in_reach, lambda n: MIN_BOSS_CHANCE if rows[n][5] == KIND_BOSS else MIN_MOB_CHANCE)
    shown.sort(key=lambda n: (chance_band(chances[n]), rows[n][5] != KIND_BOSS, -chances[n], rows[n][0]))
    # The same mob in several spots (Scarlet Monastery wings) is one row.
    out: list[list[Any]] = []
    for npc in shown:
        if not any(r[0] == rows[npc][0] and r[4] == rows[npc][4] for r in out):
            out.append(rows[npc])
    return {"mobs": out[:SHOWN_INSTANCE_MOBS], "more": len(out) - min(len(out), SHOWN_INSTANCE_MOBS)}


def world_mobs(chances: Mapping[int, float], names: Mapping[int, str]) -> list[int]:
    """Open-world mobs worth listing, most practical first: chance band, then the higher chance, then name.

    The finder shows the first SHOWN_WORLD_MOBS (one row per mob name) and counts the rest.
    """
    shown = shown_by_chance(chances, lambda _n: MIN_MOB_CHANCE)
    return sorted(shown, key=lambda n: (chance_band(chances[n]), -chances[n], names.get(n, ""), n))


def level_range(templates: Iterable[Row]) -> list[int] | None:
    """[lowest MinLevel, highest MaxLevel] of the creatures, or None for none."""
    levels = [(as_int(t["MinLevel"]), as_int(t["MaxLevel"])) for t in templates]
    if not levels:
        return None
    return [min(lo for lo, _ in levels), max(hi for _, hi in levels)]
