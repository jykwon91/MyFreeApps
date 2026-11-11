"""The Skinning guide's data, per cmangos classic-db (``skinning_loot_template`` + creature levels and spawns).

Mixed into ``ClassicSources``: every mob a solo player can skin, per zone it
has a pack in (``skinnable_mobs``), and the leather each mob level gives
(``leather_by_level``). Classic data that may differ in Forever (GPL-3.0,
written to the ``classic/`` folder).
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import TYPE_CHECKING

from scripts.wow_world_map.placement import Placement, place
from scripts.wow_world_map.zones import FOREVER_ONLY_ZONES

if TYPE_CHECKING:
    from scripts.wow_world_map.coords import ZoneBounds
    from scripts.wow_world_map.map_art import WorldMapArt
    from scripts.wow_world_map.sql_dump import SqlValue

# One row per mob per zone it has a pack in. "leather" = what it skins into most.
SKIN_MOB_COLUMNS = ["name", "minLevel", "maxLevel", "spawns", "zone", "subzone", "x", "y", "leather"]
# Skill 300 skins up to level 60 (Classic: skill / 5); higher mobs are no Skinning target.
MAX_SKIN_LEVEL = 60
# A leather given at least this share of the skins at a mob level is named for that level.
MIN_LEATHER_SHARE = 0.15
# Spawns this close (yards) count as one pack when picking where to farm a mob.
PACK_YARDS = 150.0
# A farm spot's mob must have this many spawns in the zone (not a lone rare).
MIN_FARM_SPAWNS = 4

Spot = tuple[float, float, Placement]


def _i(value: "SqlValue") -> int:
    return int(float(str(value or 0)))


def densest(spots: list[Spot]) -> Placement:
    """The spawn with the most others within PACK_YARDS — where the pack is."""
    return max(
        spots,
        key=lambda a: (sum(math.hypot(a[0] - b[0], a[1] - b[1]) <= PACK_YARDS for b in spots), -a[0], -a[1]),
    )[2]


def leather_brackets(weights: dict[int, Counter[str]]) -> list[list[object]]:
    """``[minLevel, maxLevel, [leather, ...]]`` from the skins on offer per mob level. Each level names the
    leathers given at least MIN_LEATHER_SHARE of the time; neighbouring levels with the same main leather
    are one bracket, which lists its main leather first, then the others named in it (most first)."""
    brackets: list[tuple[int, int, str, Counter[str]]] = []
    for level in sorted(weights):
        total = sum(weights[level].values())
        named = Counter({k: v / total for k, v in weights[level].items() if total and v / total >= MIN_LEATHER_SHARE})
        if not named:
            continue
        main = named.most_common(1)[0][0]
        if brackets and brackets[-1][2] == main and brackets[-1][1] == level - 1:
            lo, _, _, seen = brackets[-1]
            brackets[-1] = (lo, level, main, seen + named)
        else:
            brackets.append((level, level, main, named))
    return [[lo, hi, [main, *(n for n, _ in seen.most_common() if n != main)]] for lo, hi, main, seen in brackets]


class SkinningSources:
    """The Skinning guide half of ``ClassicSources``, which supplies these attributes."""

    _zones: "list[ZoneBounds]"
    _art: "WorldMapArt"
    _npcs: dict[int, dict[str, "SqlValue"]]
    _spawns: dict[int, list[dict[str, "SqlValue"]]]
    _skin_loot: dict[int, list[tuple[int, float]]]
    _item_names: dict[int, str]

    def _fair_game(self, npc: int) -> bool:
        raise NotImplementedError

    def _skinnable(self) -> list[int]:
        """Mobs a solo player can skin: an ordinary (not elite / rare) spawned mob, no faction's guard, up to level 60."""
        return sorted(
            npc
            for npc, row in self._npcs.items()
            if self._skin_loot.get(_i(row["SkinningLootId"]))
            and self._spawns.get(npc)
            and self._fair_game(npc)
            and _i(row["MaxLevel"]) <= MAX_SKIN_LEVEL
        )

    def _top_leather(self, npc: int) -> str:
        loot = self._skin_loot[_i(self._npcs[npc]["SkinningLootId"])]
        item = max(loot, key=lambda ic: (ic[1], -ic[0]))[0]
        return self._item_names.get(item, "")

    def skinnable_mobs(self) -> list[list[object]]:
        """SKIN_MOB_COLUMNS rows: each skinnable mob once per zone it has a pack in (MIN_FARM_SPAWNS+ spawns),
        its densest pack there and what it skins into most. By zone, then level."""
        rows: list[list[object]] = []
        for npc in self._skinnable():
            per_zone: dict[int, list[Spot]] = defaultdict(list)
            for s in self._spawns[npc]:
                wx, wy = float(str(s["position_x"])), float(str(s["position_y"]))
                spot = place(self._zones, self._art, _i(s["map"]), wx, wy, exclude=FOREVER_ONLY_ZONES)
                if spot:
                    per_zone[spot.zone.ui_map_id].append((wx, wy, spot))
            row = self._npcs[npc]
            for here in per_zone.values():
                if len(here) >= MIN_FARM_SPAWNS:
                    rows.append([
                        str(row["Name"]), _i(row["MinLevel"]), _i(row["MaxLevel"]), len(here),
                        *densest(here).as_row(), self._top_leather(npc),
                    ])
        rows.sort(key=lambda r: (int(str(r[4])), int(str(r[1])), str(r[0])))
        return rows

    def leather_item_ids(self) -> dict[str, int]:
        """Item id of every leather a skinnable mob can give, by the name the rows use — so pages can show its icon."""
        ids: dict[str, int] = {}
        for npc in self._skinnable():
            for item, _chance in self._skin_loot[_i(self._npcs[npc]["SkinningLootId"])]:
                name = self._item_names.get(item)
                if name:
                    ids.setdefault(name, item)
        return dict(sorted(ids.items()))

    def leather_by_level(self) -> list[list[object]]:
        """What skinning a mob of each level gives, weighted by how many of them spawn (``leather_brackets``)."""
        weights: dict[int, Counter[str]] = defaultdict(Counter)
        for npc in self._skinnable():
            row = self._npcs[npc]
            lo, hi = _i(row["MinLevel"]), _i(row["MaxLevel"])
            per_level = len(self._spawns[npc]) / (hi - lo + 1)
            for item, chance in self._skin_loot[_i(row["SkinningLootId"])]:
                for level in range(lo, hi + 1):
                    weights[level][self._item_names.get(item, str(item))] += chance * per_level
        return leather_brackets(weights)
