"""Where each item page's item comes from in Classic, per cmangos classic-db.

Extends the food pages' ``ClassicSources`` (vendors, quests, containers, mob
placement) with drop chances worked out the way the server rolls them
(``loot_chances.py``) and with mobs inside dungeons and raids, which the food
pages leave out. Classic data that may differ in Forever, GPL-3.0: written
only next to its own LICENSE.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Mapping
from typing import Any

from scripts.wow_food.recipe_sources import SHOWN_ZONES, ClassicSources
from scripts.wow_gear.loot import creature_maps
from scripts.wow_item_pages.drops import SHOWN_WORLD_MOBS, instance_drops, level_range, world_mobs
from scripts.wow_item_pages.loot_chances import as_int, drop_index, loot_index, pool_items, pool_users, world_pools
from scripts.wow_world_map.coords import ZoneBounds
from scripts.wow_world_map.map_art import WorldMapArt
from scripts.wow_world_map.placement import Placement, place
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

Row = Mapping[str, Any]
Spot = tuple[float, float, Placement]


class ItemSourceFinder(ClassicSources):
    """Answers "how do I get item X" for the item pages."""

    def __init__(
        self,
        zones: list[ZoneBounds],
        art: WorldMapArt,
        tables: Mapping[str, list[Row]],
        instance_types: Mapping[int, int],
        encounters: Mapping[int, set[str]],
        wanted: set[int],
    ) -> None:
        super().__init__(zones, art)
        creature_loot = loot_index(tables["creature_loot_template"])
        references = loot_index(tables["reference_loot_template"])
        pools = world_pools(creature_loot)
        self._chances = drop_index(creature_loot, references, pools, wanted)
        self._pools_of = pool_items(references, pools, wanted)
        self._pool_users = pool_users(creature_loot, pools)
        self._maps_of = creature_maps(tables["creature"], encounters)
        self._instance_types = instance_types
        self._encounters = encounters
        self.instances: set[int] = set()

    def _npc_chances(self, item: int) -> dict[int, float]:
        """Creature id -> percent per kill, for every creature whose own loot gives it."""
        chances: dict[int, float] = {}
        for loot_id, chance in self._chances.get(item, {}).items():
            for npc in self._loot_owners.get(loot_id, []):
                chances[npc] = max(chance, chances.get(npc, 0.0))
        return chances

    def _world_levels(self, item: int) -> list[int] | None:
        """Levels of the mobs whose shared world-drop loot can give it, or None when none does."""
        templates = [
            self._npcs[npc]
            for pool in self._pools_of.get(item, set())
            for loot_id in self._pool_users.get(pool, set())
            for npc in self._loot_owners.get(loot_id, [])
            if self._maps_of(self._npcs[npc])
        ]
        return level_range(templates)

    def _placed(self, npc: int) -> list[Spot]:
        spots: list[Spot] = []
        for s in self._spawns.get(npc, []):
            wx, wy = float(str(s["position_x"])), float(str(s["position_y"]))
            spot = place(self._zones, self._art, as_int(s["map"]), wx, wy, exclude=FOREVER_ONLY_ZONES)
            if spot:
                spots.append((wx, wy, spot))
        return spots

    def open_world_drop(self, item: int) -> dict[str, object] | None:
        """The food pages' drop shape: open-world mobs most practical first, plus the world-drop flag and levels."""
        chances = self._npc_chances(item)
        placed = {npc: self._placed(npc) for npc in chances if self._spawns.get(npc)}
        outside = {npc: chances[npc] for npc, spots in placed.items() if spots}
        world_levels = self._world_levels(item)
        if not outside and world_levels is None:
            return None
        names = {npc: str(self._npcs[npc]["Name"]) for npc in outside}
        rows: list[list[object]] = []
        seen: set[str] = set()
        ranked = world_mobs(outside, names)
        for npc in ranked:
            if names[npc] not in seen:
                seen.add(names[npc])
                rows.append(self._mob_row(npc, outside[npc], placed[npc]))
        zone_worth: Counter[int] = Counter()
        for npc in ranked:
            for _, _, spot in placed[npc]:
                zone_worth[spot.zone.ui_map_id] += outside[npc]
        zones = [z for z, _ in sorted(zone_worth.items(), key=lambda kv: (-kv[1], kv[0]))][:SHOWN_ZONES]
        for npc in ranked:
            for _, _, spot in placed[npc]:
                if spot.zone.ui_map_id in zones:
                    self.zone_names[spot.zone.ui_map_id] = spot.zone.name
        levels = level_range([self._npcs[n] for n in outside]) or [0, 0]
        if world_levels is not None:
            levels = [min(levels[0] or world_levels[0], world_levels[0]), max(levels[1], world_levels[1])]
        return {
            "world": world_levels is not None,
            "levels": levels,
            "mobs": rows[:SHOWN_WORLD_MOBS],
            "more": max(0, len(rows) - SHOWN_WORLD_MOBS),
            "zones": zones,
        }

    def instance_drop(self, item: int) -> dict[str, Any] | None:
        """Mobs inside dungeons and raids that drop it (``drops.INSTANCE_COLUMNS`` rows)."""
        chances = {npc: c for npc, c in self._npc_chances(item).items() if not self._spawns.get(npc)}
        found = instance_drops(chances, self._npcs, self._maps_of, self._instance_types, self._encounters)
        if found:
            self.instances.update(int(row[4]) for row in found["mobs"])
        return found

    def item_sources(self, item: int) -> dict[str, object]:
        """Everything Classic knows about getting it; empty sources left out."""
        record: dict[str, object] = {
            "vendors": self.vendors(item),
            "quests": self.quests(item),
            "drop": self.open_world_drop(item),
            "instance": self.instance_drop(item),
            "containers": self.containers(item),
            "objectSpots": self.object_spots(item),
            "containerDrops": self.container_drops(item),
        }
        return {k: v for k, v in record.items() if v}


def instance_rows(dungeon_doc: Mapping[str, Any], map_names: Mapping[int, str], instance_types: Mapping[int, int], wanted: set[int]) -> dict[int, list[Any]]:
    """Instance map id -> [name, "dungeon" | "raid", minLevel, maxLevel, requiredLevel, zone, x, y].

    The World Map's entrance rows give the levels and where the door is (the
    first wing's door for a many-winged instance); an instance with no entrance
    row (Onyxia's Lair) gets the Forever client's map name and no door.
    """
    columns = dungeon_doc["columns"]
    at = {c: columns.index(c) for c in ("instance", "name", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "x", "y")}
    out: dict[int, list[Any]] = {}
    for row in dungeon_doc["rows"]:
        map_id = int(row[at["instance"]])
        if map_id in wanted and map_id not in out:
            out[map_id] = [row[at[c]] for c in ("name", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "x", "y")]
    for map_id in wanted - set(out):
        kind = "raid" if instance_types.get(map_id) == 2 else "dungeon"
        out[map_id] = [map_names.get(map_id, f"Instance {map_id}"), kind, 0, 0, 0, None, None, None]
    return out


def quest_rows(quest_doc: Mapping[str, Any], quest_ids: set[int]) -> dict[int, list[Any]]:
    """Quest id -> [id, title, level, side, givers, minLevel, classes] for quests the World Map places a giver for.

    The first five columns are the food pages' quest row (``sourceDecode.ts`` reads them).
    """
    qc, gc = quest_doc["questColumns"], quest_doc["giverColumns"]
    giver_columns = ["type", "entry", "name", "zone", "subzone", "x", "y", "faction"]
    givers: dict[int, list[list[object]]] = defaultdict(list)
    for g in quest_doc["givers"]:
        row = dict(zip(gc, g))
        for quest in row["quests"]:
            if quest in quest_ids:
                givers[quest].append([row[c] for c in giver_columns])
    out: dict[int, list[Any]] = {}
    for q in quest_doc["quests"]:
        row = dict(zip(qc, q))
        if row["id"] in quest_ids and givers.get(row["id"]):
            out[row["id"]] = [row["id"], row["title"], row["level"], row["side"], givers[row["id"]], row["minLevel"], row["classes"]]
    return out
