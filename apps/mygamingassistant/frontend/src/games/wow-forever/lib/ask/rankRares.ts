/**
 * The rares that fit a level, nearest first: those spawning in the zone the
 * player is in (or named), then the rest of its continent, then everywhere
 * else; within each, closest to their level first. Each comes with the spot
 * its card row shows — one in the zone when it spawns there, else one in the
 * zone where it has most spots.
 */
import { fitsLevel } from "@/games/wow-forever/lib/rares/filterRares";
import { mainRareZone } from "@/games/wow-forever/lib/rares/rareMapHref";
import type { AskRankedRare } from "@/games/wow-forever/types/ask/askRankedRare";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";
import type { WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";

const NEAR = { zone: 0, continent: 1, elsewhere: 2 } as const;

function levelGap(rare: Rare, level: number): number {
  if (rare.minLevel === null || rare.maxLevel === null) return Number.POSITIVE_INFINITY;
  if (level < rare.minLevel) return rare.minLevel - level;
  if (level > rare.maxLevel) return level - rare.maxLevel;
  return 0;
}

function shownSpawn(rare: Rare, near: WorldZone | null): RareSpawn {
  const inZone = near === null ? undefined : rare.spawns.find((s) => s.zoneId === near.id);
  if (inZone !== undefined) return inZone;
  const main = mainRareZone(rare.spawns);
  return rare.spawns.find((s) => s.zoneId === main) ?? rare.spawns[0];
}

export function rankRares(rares: readonly Rare[], level: number, near: WorldZone | null, world: WorldMapData): AskRankedRare[] {
  const closeness = (spawn: RareSpawn): number => {
    if (near === null) return NEAR.elsewhere;
    if (spawn.zoneId === near.id) return NEAR.zone;
    return world.zoneById.get(spawn.zoneId)?.continent === near.continent ? NEAR.continent : NEAR.elsewhere;
  };
  return rares
    .filter((rare) => rare.spawns.length > 0 && fitsLevel(rare, level))
    .map((rare) => {
      const spawn = shownSpawn(rare, near);
      return { rare, spawn, inZone: closeness(spawn) === NEAR.zone, near: closeness(spawn), gap: levelGap(rare, level) };
    })
    .sort((a, b) => a.near - b.near || a.gap - b.gap || (a.rare.minLevel ?? 0) - (b.rare.minLevel ?? 0) || a.rare.name.localeCompare(b.rare.name))
    .map(({ rare, spawn, inZone }) => ({ rare, spawn, inZone }));
}
