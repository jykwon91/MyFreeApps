"""What each Classic creature drops and how often: the MGA Drops addon's data.

The chances come from ``scripts/wow_item_pages/loot_chances.py`` (cmangos loot
rolls: groups, equal shares, references, quest drops), worked out once for an
Alliance player and once for a Horde one, because some rows carry a faction
condition and dropping one changes how a group splits its roll. Other
conditions (a profession, a quest, a holiday, an aura) are assumed met and
named on the row instead. Shared world-drop pools collapse into one "random
world drops" chance. Pure functions; tested in ``tests/test_wow_mob_drops_generator.py``.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from scripts.wow_item_pages.loot_chances import WORLD_DROP, Key, Row, as_int, table_drops

ALLIANCE = "Alliance"
HORDE = "Horde"
# cmangos conditions (src/game/Globals/Conditions.h).
CONDITION_TEAM = 6
TEAM_IDS = {469: ALLIANCE, 67: HORDE}
CONDITION_SKILL = 7
QUEST_CONDITIONS = frozenset({8, 9, 19, 22})
HOLIDAY_CONDITIONS = frozenset({12, 26})
BUFF_CONDITIONS = frozenset({1, 10})
ITEM_CONDITIONS = frozenset({2, 3, 23})
# SkillLine ids a loot row can need.
SKILL_NAMES = {
    129: "First Aid", 164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy", 182: "Herbalism",
    185: "Cooking", 186: "Mining", 197: "Tailoring", 202: "Engineering", 333: "Enchanting",
    356: "Fishing", 393: "Skinning",
}
NOTE_QUEST = "quest"
NOTE_HOLIDAY = "holiday"
NOTE_BUFF = "buff"
NOTE_ITEM = "item"
NOTE_SKILL = "skill"
NOTE_SPECIAL = "special"

# Drops under this percent are left out; the window and the tooltip never show them.
MIN_PERCENT = 0.5
# At most this many rows per creature, likeliest first.
MAX_DROPS = 40


@dataclass(frozen=True)
class Drop:
    """One row of a creature's list: percents for an Alliance and a Horde player, and what it needs."""

    item: int
    alliance: float
    horde: float
    note: str | None


@dataclass(frozen=True)
class LootList:
    drops: tuple[Drop, ...]
    world: float
    """Percent chance of at least one random world drop (the shared pools), 0 when none."""


def percent(chance: float) -> float:
    """0..1 -> a percent, one decimal from 1% up and two below."""
    value = chance * 100.0
    return round(value, 1) if value >= 1.0 else round(value, 2)


def team_conditions(conditions: Iterable[Row]) -> dict[int, str]:
    """Condition id -> "Alliance" / "Horde", for the plain faction conditions."""
    out: dict[int, str] = {}
    for c in conditions:
        if as_int(c["type"]) == CONDITION_TEAM and as_int(c["value1"]) in TEAM_IDS:
            out[as_int(c["condition_entry"])] = TEAM_IDS[as_int(c["value1"])]
    return out


def condition_note(condition: Row | None) -> str | None:
    """A short word for what a loot row's condition needs; None for none, or a faction (split out instead)."""
    if condition is None:
        return None
    kind = as_int(condition["type"])
    if kind == CONDITION_TEAM and as_int(condition["value1"]) in TEAM_IDS:
        return None
    if kind == CONDITION_SKILL:
        return SKILL_NAMES.get(as_int(condition["value1"]), NOTE_SKILL)
    if kind in QUEST_CONDITIONS:
        return NOTE_QUEST
    if kind in HOLIDAY_CONDITIONS:
        return NOTE_HOLIDAY
    if kind in BUFF_CONDITIONS:
        return NOTE_BUFF
    if kind in ITEM_CONDITIONS:
        return NOTE_ITEM
    return NOTE_SPECIAL


def for_team(index: Mapping[int, list[Row]], teams: Mapping[int, str], team: str) -> dict[int, list[Row]]:
    """The loot index as a player of ``team`` meets it: rows only the other faction can loot left out.

    The server skips a row whose condition fails before it rolls, so a left-out row in a group
    takes no share of the roll.
    """
    def keep(row: Row) -> bool:
        needs = teams.get(as_int(row.get("condition_id")))
        return needs is None or needs == team

    return {entry: [r for r in rows if keep(r)] for entry, rows in index.items()}


def _note(key: Key, conditions: Mapping[int, Row]) -> str | None:
    _item, quest, condition_id = key
    if quest:
        return NOTE_QUEST
    return condition_note(conditions.get(condition_id)) if condition_id else None


def loot_list(
    loot_id: int,
    by_team: Mapping[str, tuple[Mapping[int, list[Row]], Mapping[int, list[Row]]]],
    pools: set[int],
    conditions: Mapping[int, Row],
    items: Mapping[int, Any],
) -> LootList:
    """A creature loot table's drops for both factions: items the Forever client has, at MIN_PERCENT or more."""
    chances: dict[str, dict[Key, float]] = {}
    for team, (creature_loot, references) in by_team.items():
        chances[team] = table_drops(creature_loot.get(loot_id, []), references, pools)
    world = max(percent(chances[team].get(WORLD_DROP, 0.0)) for team in by_team)
    merged: dict[tuple[int, str | None], list[float]] = {}
    for team, found in chances.items():
        side = 0 if team == ALLIANCE else 1
        for key, chance in found.items():
            if key == WORLD_DROP or key[0] not in items:
                continue
            row = merged.setdefault((key[0], _note(key, conditions)), [0.0, 0.0])
            row[side] = 1.0 - (1.0 - row[side]) * (1.0 - chance)
    drops = [
        Drop(item, percent(a), percent(h), note)
        for (item, note), (a, h) in merged.items()
        if max(percent(a), percent(h)) >= MIN_PERCENT
    ]
    drops.sort(key=lambda d: (-max(d.alliance, d.horde), d.item, d.note or ""))
    return LootList(tuple(drops[:MAX_DROPS]), world)


@dataclass(frozen=True)
class Creature:
    npc: int
    name: str
    min_level: int
    max_level: int
    loot: int
    """Index into the deduplicated loot lists."""


def creature_lists(
    templates: Iterable[Row],
    creature_loot: Mapping[int, list[Row]],
    references: Mapping[int, list[Row]],
    conditions: Iterable[Row],
    pools: set[int],
    items: Mapping[int, Any],
) -> tuple[list[Creature], list[LootList]]:
    """Every creature with something to show, and the distinct loot lists they point at (shared lists stored once)."""
    condition_rows = list(conditions)
    by_id = {as_int(c["condition_entry"]): c for c in condition_rows}
    teams = team_conditions(condition_rows)
    by_team = {team: (for_team(creature_loot, teams, team), for_team(references, teams, team)) for team in (ALLIANCE, HORDE)}
    lists: list[LootList] = []
    list_index: dict[LootList, int] = {}
    by_loot_id: dict[int, int | None] = {}
    creatures: list[Creature] = []
    for template in sorted(templates, key=lambda t: as_int(t["Entry"])):
        loot_id = as_int(template.get("LootId"))
        if loot_id <= 0 or loot_id not in creature_loot:
            continue
        if loot_id not in by_loot_id:
            found = loot_list(loot_id, by_team, pools, by_id, items)
            if not found.drops and not found.world:
                by_loot_id[loot_id] = None
            else:
                if found not in list_index:
                    list_index[found] = len(lists)
                    lists.append(found)
                by_loot_id[loot_id] = list_index[found]
        index = by_loot_id[loot_id]
        if index is not None:
            creatures.append(Creature(
                as_int(template["Entry"]), str(template["Name"]),
                as_int(template["MinLevel"]), as_int(template["MaxLevel"]), index,
            ))
    return creatures, lists
