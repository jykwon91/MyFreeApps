import { RARE_MAP_MAX_SCALE, RARE_MAP_PADDING } from "@/games/wow-forever/data/rares/raresConfig";
import { DEFAULT_MAP_LAYERS } from "@/games/wow-forever/data/worldMap/layerCatalog";
import { MAP_LAYER } from "@/games/wow-forever/data/worldMap/mapLayerIds";
import { MAX_MARKS_PER_MAP, WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import { MAP_MARK_STYLE } from "@/games/wow-forever/data/worldMap/mapMarkStyles";
import type { MapViewport } from "@/games/wow-forever/types/mapViewport";
import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";
import { encodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

/** The zone with most of the rare's spots (the first one on a tie), or null when it has none. */
export function mainRareZone(spawns: readonly RareSpawn[]): number | null {
  const counts = new Map<number, number>();
  for (const s of spawns) counts.set(s.zoneId, (counts.get(s.zoneId) ?? 0) + 1);
  let best: number | null = null;
  for (const [zone, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = zone;
  return best;
}

/** A view that fits every spot (0..100 coords) with RARE_MAP_PADDING round them, zoomed in no further than RARE_MAP_MAX_SCALE. */
export function fitSpots(spots: readonly { x: number; y: number }[]): MapViewport {
  const xs = spots.map((s) => s.x / 100);
  const ys = spots.map((s) => s.y / 100);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) + 2 * RARE_MAP_PADDING;
  return {
    scale: Math.min(RARE_MAP_MAX_SCALE, Math.max(1, 1 / span)),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * `/wow-forever/map?m=<zone>#view=1~…` — the World Map's own "Share this view"
 * link on the zone with most of the rare's spots, fitted to them, with a
 * read-only ★ mark on each and the Rares layer on. Null when the rare has no spots.
 */
export function rareMapHref(rare: Rare): string | null {
  const zoneId = mainRareZone(rare.spawns);
  if (zoneId === null) return null;
  const spots = rare.spawns.filter((s) => s.zoneId === zoneId).slice(0, MAX_MARKS_PER_MAP);
  const fragment = encodeMapViewFragment({
    mapId: zoneId,
    viewport: fitSpots(spots),
    layers: { ...DEFAULT_MAP_LAYERS, [MAP_LAYER.rares]: true },
    marks: {
      marks: spots.map((s, i) => ({ id: `rare-${rare.id}-${i}`, x: s.x, y: s.y, label: rare.name, style: MAP_MARK_STYLE.rare })),
      route: [],
    },
  });
  return `${WORLD_MAP_PAGE_PATH}?m=${zoneId}#${fragment}`;
}
