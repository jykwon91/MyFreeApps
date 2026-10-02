"""Where a recipe and its reagents come from, per cmangos classic-db.

Vendors, quest rewards, mob drops, skinning, fishing and containers are server-side, so
the Forever client doesn't ship them. This reads them from the pinned cmangos
dump — Classic data that may differ in Forever, and GPL-3.0: the output is
written only to the ``classic/`` data folder that carries its own LICENSE.

A source summary stays small on purpose: vendors are listed (the page shows
the player's faction first), but a mob drop is summarised as the three best
mobs to farm (drop chance x how many are spawned), the zones they live in and
their level range — not every mob. Cloth and the like, which hundreds of mobs
drop, instead get one farm spot per zone (the best mob there), so a player of
either faction at any level has somewhere named to go. An item that only drops through many mobs'
shared (reference) loot tables is a "world drop". A container (clam, herb
node) is listed only when it reliably holds the item — not a random chest.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field

from scripts.wow_world_map import sources
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.factions import ALLIANCE, HORDE, FactionTemplate, usable_by
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import Placement, place
from scripts.wow_world_map.services import CLASSIC_CONTINENTS, SAME_SPOT_YARDS
from scripts.wow_world_map.sql_dump import SqlValue, read_dump
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

# stock = how many a limited vendor holds at once (0 = unlimited); restockMinutes = time to restock one.
VENDOR_COLUMNS = ["npcId", "name", "title", "zone", "subzone", "x", "y", "faction", "stock", "restockMinutes"]
MOB_COLUMNS = ["name", "minLevel", "maxLevel", "chance", "zone", "subzone", "x", "y"]

# An item only on this many mobs' shared loot is a world drop, not a named mob's.
WORLD_DROP_MOBS = 25
# A clam / herb node / crate is a source only if it holds the item this often.
MIN_CONTAINER_CHANCE = 20.0
SHOWN_MOBS = 3
SHOWN_ZONES = 3
# This many kinds of mob dropping it = cloth-like: a farm spot per zone, in this many zones.
COMMON_DROP_MOBS = 50
COMMON_SHOWN_ZONES = 10
# A farm spot's mob must drop it at least this often, and have this many spawns in the zone (not a lone rare).
MIN_FARM_CHANCE = 5.0
MIN_FARM_SPAWNS = 4
# creature_template.Rank of an ordinary mob (1+ = elite, rare, boss): what a solo player farms.
NORMAL_RANK = 0
# A capital is its faction's ground (zones.json gives capitals a faction, not a territory).
CAPITAL_TERRITORY = {"A": "alliance", "H": "horde"}
# Drops rarer than this are noise next to a likelier mob (the expert's cut).
MIN_SHOWN_CHANCE = 1.0
# Spawns this close (yards) count as one pack when picking where to farm a mob.
PACK_YARDS = 150.0

_TABLES = {
    "creature",
    "creature_template",
    "creature_loot_template",
    "reference_loot_template",
    "skinning_loot_template",
    "fishing_loot_template",
    "gameobject_loot_template",
    "gameobject_template",
    "item_loot_template",
    "item_template",
    "npc_vendor",
    "npc_vendor_template",
    "quest_template",
    "game_event_creature",
}

Row = dict[str, SqlValue]


def _i(value: SqlValue) -> int:
    return int(float(str(value or 0)))


@dataclass
class LootIndex:
    """item -> the loot tables it is in (following reference tables): (table, chance, via reference)."""

    by_table: dict[int, list[tuple[int, float, bool]]] = field(default_factory=lambda: defaultdict(list))

    @classmethod
    def build(cls, rows: Iterable[Row], references: dict[int, list[tuple[int, float]]]) -> "LootIndex":
        index = cls()
        for r in rows:
            ref = _i(r["mincountOrRef"])
            if ref < 0:
                for item, chance in references.get(-ref, []):
                    index.by_table[item].append((_i(r["entry"]), chance, True))
            else:
                chance = abs(float(str(r["ChanceOrQuestChance"] or 0)))
                index.by_table[_i(r["item"])].append((_i(r["entry"]), chance, False))
        return index


def _references(rows: Iterable[Row]) -> dict[int, list[tuple[int, float]]]:
    refs: dict[int, list[tuple[int, float]]] = defaultdict(list)
    for r in rows:
        if _i(r["mincountOrRef"]) >= 0:
            refs[_i(r["entry"])].append((_i(r["item"]), abs(float(str(r["ChanceOrQuestChance"] or 0)))))
    return refs



def _stock(row: Row) -> tuple[int, int]:
    """(how many a limited vendor holds, minutes to restock one) — (0, 0) for unlimited."""
    stock = _i(row["maxcount"])
    if not stock:
        return 0, 0
    return stock, round(_i(row["incrtime"]) / 60)

class ClassicSources:
    """Answers "where does item X come from" from the cmangos dump."""

    def __init__(self, zones: list[ZoneBounds], art: WorldMapArt) -> None:
        self._zones = zones
        self._art = art
        t = read_dump(sources.cmangos_dump(), _TABLES)
        self._reactions = {
            int(r["ID"]): FactionTemplate.from_csv_row(r) for r in sources.wago_table("FactionTemplate")
        }
        self._area_names = {int(r["ID"]): r["AreaName_lang"].strip() for r in sources.wago_table("AreaTable")}
        self._npcs = {_i(r["Entry"]): r for r in t["creature_template"]}
        event_only = {_i(r["guid"]) for r in t["game_event_creature"] if _i(r["event"]) > 0}
        self._spawns: dict[int, list[Row]] = defaultdict(list)
        for s in sorted(t["creature"], key=lambda r: _i(r["guid"])):
            if _i(s["map"]) in CLASSIC_CONTINENTS and _i(s["guid"]) not in event_only:
                self._spawns[_i(s["id"])].append(s)

        self._sold: dict[int, dict[int, tuple[int, int]]] = defaultdict(dict)  # item -> npc -> (stock, restock min)
        by_template: dict[int, list[int]] = defaultdict(list)
        for npc in self._npcs.values():
            if _i(npc["VendorTemplateId"]):
                by_template[_i(npc["VendorTemplateId"])].append(_i(npc["Entry"]))
        for r in t["npc_vendor"]:
            self._sold[_i(r["item"])][_i(r["entry"])] = _stock(r)
        for r in t["npc_vendor_template"]:
            for npc in by_template[_i(r["entry"])]:
                self._sold[_i(r["item"])][npc] = _stock(r)

        refs = _references(t["reference_loot_template"])
        self._loot_owners: dict[int, list[int]] = defaultdict(list)
        for npc in self._npcs.values():
            if _i(npc["LootId"]):
                self._loot_owners[_i(npc["LootId"])].append(_i(npc["Entry"]))
        self._creature_loot = LootIndex.build(t["creature_loot_template"], refs)
        self._skin_owners: dict[int, list[int]] = defaultdict(list)
        for npc in self._npcs.values():
            if _i(npc["SkinningLootId"]):
                self._skin_owners[_i(npc["SkinningLootId"])].append(_i(npc["Entry"]))
        self._skinning = LootIndex.build(t["skinning_loot_template"], refs)
        self._fishing = LootIndex.build(t["fishing_loot_template"], refs)
        self._object_loot = LootIndex.build(t["gameobject_loot_template"], refs)
        self._item_loot = LootIndex.build(t["item_loot_template"], refs)
        # A chest-type object (type 3) names its loot table in data1.
        self._object_names: dict[int, set[str]] = defaultdict(set)
        for o in t["gameobject_template"]:
            if _i(o["type"]) == 3 and _i(o["data1"]):
                self._object_names[_i(o["data1"])].add(str(o["name"]))
        self._item_names = {_i(r["entry"]): str(r["name"]) for r in t["item_template"]}
        self._rewarded: dict[int, list[int]] = defaultdict(list)
        for q in t["quest_template"]:
            keys = [f"RewChoiceItemId{i}" for i in range(1, 7)] + [f"RewItemId{i}" for i in range(1, 5)]
            for key in keys:
                if _i(q[key]):
                    self._rewarded[_i(q[key])].append(_i(q["entry"]))
        self.zone_names: dict[int, str] = {}

    # ---- vendors ---------------------------------------------------------

    def vendors(self, item: int) -> list[list[object]]:
        rows: list[list[object]] = []
        for npc_id, (stock, restock) in sorted(self._sold.get(item, {}).items()):
            npc = self._npcs.get(npc_id)
            if npc is None:
                continue
            faction = usable_by(_i(npc["Faction"]), self._reactions)
            if faction is None:
                continue
            for spot in self._places(npc_id):
                self.zone_names[spot.zone.ui_map_id] = spot.zone.name
                rows.append([npc_id, str(npc["Name"]), str(npc["SubName"] or ""), *spot.as_row(), faction, stock, restock])
        rows.sort(key=lambda r: (str(r[1]), int(str(r[3]))))
        return rows

    def _places(self, npc_id: int) -> list:
        spots = []
        seen: list[tuple[float, float]] = []
        for s in self._spawns.get(npc_id, []):
            wx, wy = float(str(s["position_x"])), float(str(s["position_y"]))
            if any(math.hypot(wx - px, wy - py) < SAME_SPOT_YARDS for px, py in seen):
                continue
            spot = place(self._zones, self._art, _i(s["map"]), wx, wy, exclude=FOREVER_ONLY_ZONES)
            if spot is None:
                continue
            seen.append((wx, wy))
            spots.append(spot)
        return spots

    # ---- drops -----------------------------------------------------------

    def drop(self, item: int) -> dict[str, object] | None:
        chances: dict[int, float] = {}
        direct = False
        for loot_id, chance, via_ref in self._creature_loot.by_table.get(item, []):
            for npc in self._loot_owners.get(loot_id, []):
                if self._spawns.get(npc):
                    chances[npc] = max(chance, chances.get(npc, 0.0))
                    direct = direct or not via_ref
        if not chances:
            return None
        levels = [(_i(self._npcs[n]["MinLevel"]), _i(self._npcs[n]["MaxLevel"])) for n in chances]
        # Expected drops on offer: a common mob at 40% beats a rare one at 50%.
        zone_worth: Counter[int] = Counter()
        mob_worth: Counter[int] = Counter()
        placed: dict[int, list[tuple[float, float, Placement]]] = defaultdict(list)
        for npc in chances:
            for s in self._spawns[npc]:
                wx, wy = float(str(s["position_x"])), float(str(s["position_y"]))
                spot = place(self._zones, self._art, _i(s["map"]), wx, wy, exclude=FOREVER_ONLY_ZONES)
                if spot:
                    zone_worth[spot.zone.ui_map_id] += chances[npc]
                    mob_worth[npc] += chances[npc]
                    placed[npc].append((wx, wy, spot))
        world = not direct and len(chances) >= WORLD_DROP_MOBS
        ranked_zones = [z for z, _ in sorted(zone_worth.items(), key=lambda kv: (-kv[1], kv[0]))]
        mobs: list[list[object]] = []
        if not world and len(chances) >= COMMON_DROP_MOBS:
            mobs = self._farm_spots(chances, placed, ranked_zones[:COMMON_SHOWN_ZONES])
        if not world and not mobs:
            # Too rare anywhere to be a farm spot: the likeliest mobs, so the page can say it's a rare drop.
            best = sorted(chances, key=lambda n: (-mob_worth[n], str(self._npcs[n]["Name"])))
            shown = [n for n in best if chances[n] >= MIN_SHOWN_CHANCE][:SHOWN_MOBS] or best[:1]
            mobs = [self._mob_row(n, chances[n], placed[n]) for n in shown]
        zones = ranked_zones[:SHOWN_ZONES]
        for spots in placed.values():
            for _, _, spot in spots:
                if spot.zone.ui_map_id in zones:
                    self.zone_names[spot.zone.ui_map_id] = spot.zone.name
        return {
            "world": world,
            "levels": [min(lo for lo, _ in levels), max(hi for _, hi in levels)],
            "mobs": mobs,
            "more": len(chances) - len(mobs),
            "zones": zones,
        }

    def _mob_row(self, npc: int, chance: float, spots: list[tuple[float, float, Placement]]) -> list[object]:
        row = self._npcs[npc]
        return [str(row["Name"]), _i(row["MinLevel"]), _i(row["MaxLevel"]), round(chance, 1), *self._farm_spot(spots)]

    def _farm_spots(
        self,
        chances: dict[int, float],
        placed: dict[int, list[tuple[float, float, Placement]]],
        zones: list[int],
    ) -> list[list[object]]:
        """Cloth and the like: the best mob to farm in each zone (most drops on offer), a different mob per zone."""
        rows: list[list[object]] = []
        used: set[int] = set()
        for zone in zones:
            here = {
                n: [s for s in placed[n] if s[2].zone.ui_map_id == zone]
                for n in chances
                if n not in used and chances[n] >= MIN_FARM_CHANCE and self._fair_game(n)
            }
            ranked = sorted((n for n, s in here.items() if len(s) >= MIN_FARM_SPAWNS), key=lambda n: (-chances[n] * len(here[n]), str(self._npcs[n]["Name"])))
            if ranked:
                used.add(ranked[0])
                rows.append(self._mob_row(ranked[0], chances[ranked[0]], here[ranked[0]]))
        return rows

    def _fair_game(self, npc: int) -> bool:
        """A solo player of either faction can farm it — not an elite, nor a guard only the other side may attack."""
        if _i(self._npcs[npc]["Rank"]) != NORMAL_RANK:
            return False
        return usable_by(_i(self._npcs[npc]["Faction"]), self._reactions) not in (ALLIANCE, HORDE)

    def _farm_spot(self, spots: list[tuple[float, float, Placement]]) -> list[object]:
        """Where to farm a mob: the spawn with the most others nearby, in its busiest zone."""
        if not spots:
            return [None, "", None, None]
        per_zone = Counter(spot.zone.ui_map_id for _, _, spot in spots)
        zone = max(per_zone, key=lambda z: (per_zone[z], -z))
        here = [s for s in spots if s[2].zone.ui_map_id == zone]
        wx, wy, best = max(
            here,
            key=lambda a: (sum(math.hypot(a[0] - b[0], a[1] - b[1]) <= PACK_YARDS for b in here), -a[0], -a[1]),
        )
        self.zone_names[zone] = best.zone.name
        return best.as_row()

    def skinning(self, item: int) -> dict[str, object] | None:
        """Leather and hides: the level band of the mobs that skin into it and the zones with the most of them."""
        chances: dict[int, float] = {}
        for loot_id, chance, _ in self._skinning.by_table.get(item, []):
            for npc in self._skin_owners.get(loot_id, []):
                if self._spawns.get(npc) and chance >= MIN_SHOWN_CHANCE:
                    chances[npc] = max(chance, chances.get(npc, 0.0))
        if not chances:
            return None
        zone_worth: Counter[int] = Counter()
        for npc, chance in chances.items():
            for s in self._spawns[npc]:
                wx, wy = float(str(s["position_x"])), float(str(s["position_y"]))
                spot = place(self._zones, self._art, _i(s["map"]), wx, wy, exclude=FOREVER_ONLY_ZONES)
                if spot:
                    zone_worth[spot.zone.ui_map_id] += chance
                    self.zone_names.setdefault(spot.zone.ui_map_id, spot.zone.name)
        if not zone_worth:
            return None
        levels = [(_i(self._npcs[n]["MinLevel"]), _i(self._npcs[n]["MaxLevel"])) for n in chances]
        return {
            "levels": [min(lo for lo, _ in levels), max(hi for _, hi in levels)],
            "zones": [z for z, _ in sorted(zone_worth.items(), key=lambda kv: (-kv[1], kv[0]))[:SHOWN_ZONES]],
            "mobs": len(chances),
        }

    def fishing(self, item: int) -> list[str]:
        areas = {area for area, _, _ in self._fishing.by_table.get(item, [])}
        return sorted({self._area_names[a] for a in areas if a in self._area_names})

    def containers(self, item: int) -> list[str]:
        """Clams, crates and chests the item is found in."""
        names = {
            self._item_names[i]
            for i, chance, _ in self._item_loot.by_table.get(item, [])
            if i in self._item_names and chance >= MIN_CONTAINER_CHANCE
        }
        for loot_id, chance, _ in self._object_loot.by_table.get(item, []):
            if chance >= MIN_CONTAINER_CHANCE:
                names |= self._object_names.get(loot_id, set())
        return sorted(names)

    def quests(self, item: int) -> list[int]:
        return sorted(set(self._rewarded.get(item, [])))

    # ---- summaries -------------------------------------------------------

    def recipe_sources(self, recipe_item: int) -> dict[str, object]:
        return _compact({
            "vendors": self.vendors(recipe_item),
            "quests": self.quests(recipe_item),
            "drop": self.drop(recipe_item),
            "containers": self.containers(recipe_item),
        })

    def reagent_sources(self, item: int) -> dict[str, object]:
        drop = self.drop(item)
        skin = self.skinning(item)
        # A few beasts that skin into what hundreds of mobs drop (sheep -> Wool Cloth) aren't the way to get it.
        if skin and drop and int(str(skin["mobs"])) < len(drop["mobs"]) + int(str(drop["more"])):  # type: ignore[arg-type]
            skin = None
        if skin:
            del skin["mobs"]
        return _compact({
            "vendors": self.vendors(item),
            "drop": drop,
            "skinning": skin,
            "fishing": self.fishing(item),
            "containers": self.containers(item),
            "quests": self.quests(item),
        })


def territory_of(zone_ids: Iterable[int], zones: Iterable[dict[str, object]]) -> dict[str, str]:
    """Zone id -> "alliance" / "horde" / "contested" for the zones named, from the zones.json entries; a capital is its faction's."""
    sides: dict[int, str] = {}
    for z in zones:
        side = z.get("territory") or CAPITAL_TERRITORY.get(str(z.get("faction", "")))
        if side:
            sides[int(str(z["id"]))] = str(side)
    return {str(i): sides[i] for i in sorted(zone_ids) if i in sides}


def _compact(record: dict[str, object]) -> dict[str, object]:
    """Drop empty sources so the JSON only says what is known."""
    return {k: v for k, v in record.items() if v}
