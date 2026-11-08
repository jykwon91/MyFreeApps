import { RARE_FIT_LEVELS_ABOVE, RARE_FIT_LEVELS_BELOW } from "@/games/wow-forever/data/rares/raresConfig";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareFilters } from "@/games/wow-forever/types/rares/rareFilters";

/** Whether a rare's level range comes near `level`: down to RARE_FIT_LEVELS_BELOW under, up to RARE_FIT_LEVELS_ABOVE over. */
export function fitsLevel(rare: Rare, level: number): boolean {
  if (rare.minLevel === null || rare.maxLevel === null) return false;
  return rare.maxLevel >= level - RARE_FIT_LEVELS_BELOW && rare.minLevel <= level + RARE_FIT_LEVELS_ABOVE;
}

/**
 * The rares the filters keep, in the order given. Any level filter drops
 * rares with no level (new in Forever). "Fits my level" does nothing until
 * the player has a level.
 */
export function filterRares(rares: readonly Rare[], filters: RareFilters, playerLevel: number | null): Rare[] {
  const { zoneId, minLevel, maxLevel, fitsMyLevel } = filters;
  const fitLevel = fitsMyLevel ? playerLevel : null;
  return rares.filter((rare) => {
    if (zoneId !== null && !rare.spawns.some((s) => s.zoneId === zoneId)) return false;
    if (minLevel !== null && (rare.maxLevel === null || rare.maxLevel < minLevel)) return false;
    if (maxLevel !== null && (rare.minLevel === null || rare.minLevel > maxLevel)) return false;
    if (fitLevel !== null && !fitsLevel(rare, fitLevel)) return false;
    return true;
  });
}
