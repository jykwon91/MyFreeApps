"""Where to farm gold while leveling, per cmangos classic-db.

A farm spot is one kind of ordinary mob, at the place it's packed most
densely. What it's worth is worked out from the loot tables, not from any
market: the coin it drops plus the vendor price of everything it drops,
weighed by drop chance. Vendor prices are fixed in the game data, so that
number holds on a brand-new realm where nobody knows what sells — it's the
floor. On top of it, the drops other players pay more for (cloth, greens,
recipes, leather from skinning) are counted so the page can say how many to
expect, not what they'll fetch.

Loot-table rules (cmangos): a negative chance is a quest item (skipped); an
entry with a condition is skipped; groupid 0 entries roll on their own; a
group rolls once — explicit chances first, entries with chance 0 sharing
what's left; a reference row rolls its chance, then runs the referenced
table ``maxcount`` times.
"""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from scripts.wow_world_map.factions import (
    ALLIANCE_RACE_TEMPLATES,
    HORDE_RACE_TEMPLATES,
    FactionTemplate,
)
from scripts.wow_world_map.placement import Placement, place
from scripts.wow_world_map.services import CLASSIC_CONTINENTS
from scripts.wow_world_map.sql_dump import SqlValue
from scripts.wow_world_map.zones import CAPITAL_FACTION, FOREVER_ONLY_ZONES

Row = dict[str, SqlValue]

TABLES = {
    "creature",
    "creature_template",
    "creature_loot_template",
    "reference_loot_template",
    "skinning_loot_template",
    "item_template",
    "game_event_creature",
}

NORMAL_RANK = 0
CRITTER = 8
# UNIT_FLAG_NON_ATTACKABLE | UNIT_FLAG_NOT_SELECTABLE: scenery, not a mob.
UNATTACKABLE_FLAGS = 0x2 | 0x2000000
ITEM_TRADE_GOODS = 7
ITEM_RECIPE = 9
QUALITY_UNCOMMON = 2
QUALITY_RARE = 3
# Spawns this close (yards) are one pack — about a minute's walk end to end.
PACK_YARDS = 150.0
# A pack smaller than this runs dry while you kill it.
MIN_PACK = 6
# What one player kills an hour, travel and rest included (the expert's leveling figure).
KILLS_PER_HOUR = 60
# A mob listed across more levels than this is scripted scenery (Caer Darrow's 12-60 citizens), not a camp.
MAX_LEVEL_SPAN = 6
# Timbermaw Hold: the reputation players need to pass through Timbermaw's tunnels — killing its furbolgs costs it.
REPUTATION_FACTIONS = {576}

FARM_COLUMNS = [
    "npcId", "name", "minLevel", "maxLevel", "type", "zone", "subzone", "x", "y",
    "pack", "respawnSec", "coin", "vendor", "killsPerHour",
    "cloth", "clothPerKill", "greensPerKill", "bluesPerKill", "recipesPerKill",
    "skin", "skinVendor",
]

CREATURE_TYPES = {1: "beast", 2: "dragonkin", 3: "demon", 4: "elemental", 5: "giant", 6: "undead", 7: "humanoid", 9: "mechanical"}


def _i(value: SqlValue) -> int:
    return int(float(str(value or 0)))


def _f(value: SqlValue) -> float:
    return float(str(value or 0))


@dataclass
class Haul:
    """What one roll of a loot table gives, on average."""

    vendor: float = 0.0  # copper, at vendor price
    greens: float = 0.0
    blues: float = 0.0
    recipes: float = 0.0
    cloth: dict[int, float] | None = None  # cloth item -> how many

    def add(self, other: Haul, times: float) -> None:
        self.vendor += other.vendor * times
        self.greens += other.greens * times
        self.blues += other.blues * times
        self.recipes += other.recipes * times
        for item, n in (other.cloth or {}).items():
            self.cloth = self.cloth or {}
            self.cloth[item] = self.cloth.get(item, 0.0) + n * times


class LootTables:
    """Expected haul of each loot table, references followed."""

    def __init__(self, rows: Iterable[Row], references: LootTables | None, items: dict[int, Row]) -> None:
        self._rows: dict[int, list[Row]] = defaultdict(list)
        for r in rows:
            self._rows[_i(r["entry"])].append(r)
        self._refs = references or self
        self._items = items
        self._memo: dict[int, Haul] = {}

    def haul(self, entry: int, depth: int = 0) -> Haul:
        if entry in self._memo:
            return self._memo[entry]
        total = Haul()
        if depth > 8:
            return total
        groups: dict[int, list[Row]] = defaultdict(list)
        for r in self._rows.get(entry, []):
            if _f(r["ChanceOrQuestChance"]) < 0 or _i(r["condition_id"]):
                continue
            if _i(r["groupid"]):
                groups[_i(r["groupid"])].append(r)
            else:
                total.add(self._entry(r, depth), _f(r["ChanceOrQuestChance"]) / 100)
        for rows in groups.values():
            explicit = sum(_f(r["ChanceOrQuestChance"]) for r in rows)
            equal = [r for r in rows if _f(r["ChanceOrQuestChance"]) == 0]
            share = max(0.0, 100 - explicit) / len(equal) if equal else 0.0
            for r in rows:
                chance = _f(r["ChanceOrQuestChance"]) or share
                total.add(self._entry(r, depth), chance / 100)
        self._memo[entry] = total
        return total

    def _entry(self, r: Row, depth: int) -> Haul:
        ref = _i(r["mincountOrRef"])
        if ref < 0:
            out = Haul()
            out.add(self._refs.haul(-ref, depth + 1), max(1, _i(r["maxcount"])))
            return out
        item = self._items.get(_i(r["item"]))
        out = Haul()
        if item is None:
            return out
        count = (max(1, ref) + max(1, _i(r["maxcount"]))) / 2
        out.vendor = _i(item["SellPrice"]) * count
        klass, quality = _i(item["class"]), _i(item["Quality"])
        if klass == ITEM_RECIPE:
            out.recipes = count
        elif quality == QUALITY_UNCOMMON and klass in (2, 4):
            out.greens = count
        elif quality >= QUALITY_RARE and klass in (2, 4):
            out.blues = count
        if klass == ITEM_TRADE_GOODS and str(item["name"]).lower().endswith("cloth"):
            out.cloth = {_i(item["entry"]): count}
        return out


class GoldFarms:
    def __init__(self, tables: dict[str, list[Row]], reactions: dict[int, FactionTemplate], zones, art) -> None:
        self._zones = zones
        self._art = art
        self._reactions = reactions
        self._items = {_i(r["entry"]): r for r in tables["item_template"]}
        self._npcs = {_i(r["Entry"]): r for r in tables["creature_template"]}
        refs = LootTables(tables["reference_loot_template"], None, self._items)
        self._loot = LootTables(tables["creature_loot_template"], refs, self._items)
        self._skin = LootTables(tables["skinning_loot_template"], refs, self._items)
        event_only = {_i(r["guid"]) for r in tables["game_event_creature"] if _i(r["event"]) > 0}
        self._spawns: dict[int, list[Row]] = defaultdict(list)
        for s in sorted(tables["creature"], key=lambda r: _i(r["guid"])):
            if _i(s["map"]) in CLASSIC_CONTINENTS and _i(s["guid"]) not in event_only:
                self._spawns[_i(s["id"])].append(s)
        self.zone_names: dict[int, str] = {}

    def item_name(self, item: int) -> str:
        return str(self._items[item]["name"])

    def _farmable(self, npc: Row) -> bool:
        if _i(npc["Rank"]) != NORMAL_RANK or _i(npc["CreatureType"]) == CRITTER:
            return False
        if _i(npc["UnitFlags"]) & UNATTACKABLE_FLAGS:
            return False
        if _i(npc["MaxLevel"]) - _i(npc["MinLevel"]) > MAX_LEVEL_SPAN:
            return False
        return self._fair_game(_i(npc["Faction"]))

    def _fair_game(self, template_id: int) -> bool:
        """Friendly to no player race (not a town's citizens or guards, of either side) and not a rep faction."""
        npc = self._reactions.get(template_id)
        if npc is None or npc.faction in REPUTATION_FACTIONS:
            return False
        for race in ALLIANCE_RACE_TEMPLATES + HORDE_RACE_TEMPLATES:
            player = self._reactions[race]
            if player.faction in npc.friends or npc.friend_group & player.faction_group:
                return False
        return True

    def _pack(self, npc_id: int) -> tuple[Placement, int, float] | None:
        """The spawn with the most of its kind within PACK_YARDS: where, how many, mean respawn (s)."""
        spots = []
        for s in self._spawns.get(npc_id, []):
            wx, wy = _f(s["position_x"]), _f(s["position_y"])
            spots.append((wx, wy, s))
        if len(spots) < MIN_PACK:
            return None
        best = max(
            spots,
            key=lambda a: (sum(math.hypot(a[0] - b[0], a[1] - b[1]) <= PACK_YARDS for b in spots), -a[0], -a[1]),
        )
        near = [b for b in spots if math.hypot(best[0] - b[0], best[1] - b[1]) <= PACK_YARDS]
        if len(near) < MIN_PACK:
            return None
        where = place(self._zones, self._art, _i(best[2]["map"]), best[0], best[1], exclude=FOREVER_ONLY_ZONES)
        if where is None or where.zone.ui_map_id in CAPITAL_FACTION:
            return None
        respawn = sum((_i(b[2]["spawntimesecsmin"]) + _i(b[2]["spawntimesecsmax"])) / 2 for b in near) / len(near)
        return where, len(near), respawn

    def farms(self) -> list[list[object]]:
        rows: list[list[object]] = []
        for npc_id, npc in sorted(self._npcs.items()):
            if not self._spawns.get(npc_id) or not self._farmable(npc):
                continue
            haul = self._loot.haul(_i(npc["LootId"])) if _i(npc["LootId"]) else Haul()
            coin = (_i(npc["MinLootGold"]) + _i(npc["MaxLootGold"])) / 2
            if coin + haul.vendor <= 0:
                continue
            pack = self._pack(npc_id)
            if pack is None:
                continue
            where, size, respawn = pack
            # A small pack on a slow respawn runs out before you do.
            kills = min(KILLS_PER_HOUR, size * 3600 / respawn) if respawn > 0 else KILLS_PER_HOUR
            cloth_item, cloth_n = max((haul.cloth or {}).items(), key=lambda kv: kv[1], default=(None, 0.0))
            skin_item, skin_vendor = None, 0
            if _i(npc["SkinningLootId"]):
                skin = self._skin.haul(_i(npc["SkinningLootId"]))
                skin_vendor = round(skin.vendor)
                skin_item = self._top_item(self._skin, _i(npc["SkinningLootId"]))
            self.zone_names[where.zone.ui_map_id] = where.zone.name
            rows.append([
                npc_id, str(npc["Name"]), _i(npc["MinLevel"]), _i(npc["MaxLevel"]),
                CREATURE_TYPES.get(_i(npc["CreatureType"]), "other"), *where.as_row(),
                size, round(respawn), round(coin), round(haul.vendor), round(kills),
                self.item_name(cloth_item) if cloth_item else "", round(cloth_n, 2),
                round(haul.greens, 3), round(haul.blues, 4), round(haul.recipes, 4),
                self.item_name(skin_item) if skin_item else "", skin_vendor,
            ])
        return rows

    def _top_item(self, tables: LootTables, entry: int) -> int | None:
        """The likeliest item of a (skinning) table — "Light Leather"."""
        best: tuple[float, int] | None = None
        for r in tables._rows.get(entry, []):
            if _i(r["mincountOrRef"]) > 0 and _f(r["ChanceOrQuestChance"]) >= 0 and _i(r["item"]) in self._items:
                key = (_f(r["ChanceOrQuestChance"]) or 100.0, -_i(r["item"]))
                if best is None or key > best:
                    best = key
        return -best[1] if best else None
