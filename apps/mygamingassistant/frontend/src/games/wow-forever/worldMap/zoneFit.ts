import { FIT_LEVELS_BELOW_MIN } from "@/games/wow-forever/data/worldMap/levelFit";
import { ZONE_FIT, type ZoneFit } from "@/games/wow-forever/types/mapLayers/zoneFit";
import type { MapView, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { childrenOf } from "@/games/wow-forever/worldMap/mapHitTest";

/** How a zone with level range `levels` suits a player of `level`; null when either is unknown. */
export function zoneFit(levels: readonly [number, number] | undefined | null, level: number | null): ZoneFit | null {
  if (!levels || level === null) return null;
  const [min, max] = levels;
  if (level < min - FIT_LEVELS_BELOW_MIN) return ZONE_FIT.tooHigh;
  if (level > max) return ZONE_FIT.tooLow;
  return ZONE_FIT.right;
}

/** "5–10", or "55" when both ends match. */
export function zoneLevelText([min, max]: readonly [number, number]): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/** How each zone on `map` (by map id) suits a player of `level`; zones with no level range are left out. */
export function zoneFitsOf(data: WorldMapData, map: MapView, level: number): ReadonlyMap<number, ZoneFit> {
  const fits = new Map<number, ZoneFit>();
  for (const child of childrenOf(data, map.id)) {
    const fit = zoneFit(child.zone?.levels, level);
    if (fit) fits.set(child.id, fit);
  }
  return fits;
}
