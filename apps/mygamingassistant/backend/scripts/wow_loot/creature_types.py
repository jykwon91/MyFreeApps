"""What share of the mobs at each level are each creature type, for MGA Loot's "vs Humanoids" stats.

An item with "+10 spell damage vs Humanoids" only helps against humanoids, so MGA Loot counts it at
the share of mobs at your level that are humanoids. The shares come from the cmangos classic-db spawn
table: every spawned creature with no NPC role (no vendor, trainer, quest giver...), by its creature
type and minimum level, in ten-level bands. Critters, totems, non-combat pets and untyped creatures
don't count. Spawns are where mobs stand, not what you kill, so it's an estimate; the addon says so.

Run from apps/mygamingassistant/backend:  python -m scripts.wow_loot.creature_types
"""
from __future__ import annotations

import json
from collections import Counter

from scripts.wow_food.build import WOW_DATA_DIR
from scripts.wow_world_map.sources import CMANGOS_COMMIT, cmangos_dump
from scripts.wow_world_map.sql_dump import read_dump

OUT = WOW_DATA_DIR / "lootAddon" / "creatureTypeShare.json"
# cmangos CreatureType -> the word in Forever's "Spell Damage Vs <Type>" stat keys.
CREATURE_TYPES = {
    1: "BEAST", 2: "DRAGONKIN", 3: "DEMON", 4: "ELEMENTAL", 5: "GIANT", 6: "UNDEAD", 7: "HUMANOID", 9: "MECHANICAL",
}
BAND = 10
TOP_BAND_START = 50  # 50 and up is one band: level 60 elites and raid mobs.


def band_of(level: int) -> int:
    return min(level // BAND * BAND, TOP_BAND_START)


def creature_type_shares(creatures: list[dict], templates: list[dict]) -> dict[int, dict[str, float]]:
    """``band start level -> {type: share}``, shares to two decimals, over every band with mobs."""
    by_entry = {t["Entry"]: t for t in templates}
    counts: dict[int, Counter[str]] = {}
    for spawn in creatures:
        template = by_entry.get(spawn["id"])
        if not template or int(template["NpcFlags"] or 0):
            continue
        kind = CREATURE_TYPES.get(int(template["CreatureType"] or 0))
        if not kind:
            continue
        counts.setdefault(band_of(int(template["MinLevel"] or 0)), Counter())[kind] += 1
    shares: dict[int, dict[str, float]] = {}
    for band, c in sorted(counts.items()):
        total = sum(c.values())
        shares[band] = {kind: round(n / total, 2) for kind, n in sorted(c.items())}
    return shares


def main() -> None:
    dump = read_dump(cmangos_dump(), {"creature", "creature_template"})
    shares = creature_type_shares(dump["creature"], dump["creature_template"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": f"cmangos/classic-db@{CMANGOS_COMMIT}",
        "note": "Share of spawned mobs (no NPC role) of each creature type, by ten-level band of minimum level.",
        "bandSize": BAND,
        "bands": {str(band): s for band, s in shares.items()},
    }, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
