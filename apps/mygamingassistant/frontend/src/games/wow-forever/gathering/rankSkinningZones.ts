import { MIN_ZONE_SPAWNS, MOBS_PER_ZONE, ZONES_SHOWN } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { isHostileGround } from "@/games/wow-forever/food/recipeSources";
import { zoneLevelGap } from "@/games/wow-forever/gathering/zoneLevelGap";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";
import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";
import type { SkinningZone } from "@/games/wow-forever/types/gathering/skinningZone";
import type { PlayerFaction, WorldZone } from "@/games/wow-forever/types/worldMap";

export interface SkinningZoneInput {
  mobs: readonly SkinnableMob[];
  band: Pick<SkinBand, "min" | "max" | "level">;
  faction: PlayerFaction;
  zoneById: ReadonlyMap<number, WorldZone>;
}

/** Most spawns first; a tie goes by name so the order never shuffles. */
function mobOrder(a: SkinnableMob, b: SkinnableMob): number {
  return b.spawns - a.spawns || a.name.localeCompare(b.name);
}

/** Zones that fit your level first (Forever's level range), then the most beasts. */
function zoneOrder(level: number | null) {
  return (a: SkinningZone, b: SkinningZone): number => {
    if (level !== null) {
      const byGap = zoneLevelGap(a.levels, level) - zoneLevelGap(b.levels, level);
      if (byGap) return byGap;
    }
    return b.spawns - a.spawns || a.zoneName.localeCompare(b.zoneName);
  };
}

function zoneOf(here: readonly SkinnableMob[], zoneById: ReadonlyMap<number, WorldZone>): SkinningZone {
  const { zoneId, zoneName } = here[0].spot;
  return {
    zoneId,
    zoneName,
    levels: zoneById.get(zoneId)?.levels ?? null,
    spawns: here.reduce((sum, m) => sum + m.spawns, 0),
    mobs: [...here].sort(mobOrder).slice(0, MOBS_PER_ZONE),
  };
}

/**
 * Two or three zones to skin in: every mob whose whole level range is in your
 * band, off the other faction's ground, grouped by zone. Zones whose Forever
 * level range fits you come first, then the ones with the most of those
 * beasts. Each zone lists its `MOBS_PER_ZONE` most common.
 */
export function rankSkinningZones({ mobs, band, faction, zoneById }: SkinningZoneInput): SkinningZone[] {
  const byZone = new Map<number, SkinnableMob[]>();
  for (const mob of mobs) {
    if (mob.minLevel < band.min || mob.maxLevel > band.max || isHostileGround(mob.spot, faction)) continue;
    byZone.set(mob.spot.zoneId, [...(byZone.get(mob.spot.zoneId) ?? []), mob]);
  }
  return [...byZone.values()]
    .map((here) => zoneOf(here, zoneById))
    .filter((z) => z.spawns >= MIN_ZONE_SPAWNS)
    .sort(zoneOrder(band.level))
    .slice(0, ZONES_SHOWN);
}
