/**
 * What is under a point of the map — the page's C_Map.GetMapInfoAtPosition.
 *
 * Map percent -> world yards -> the smallest child map whose world rectangle
 * holds the point AND whose outline (the client's highlight art, as a mask)
 * covers it. On a continent / the world map the candidates are the viewed
 * map's children; on a zone or city map they are its siblings (the parent's
 * children, itself included) — so a click over a border opens the zone there.
 * Cities and island maps ship no outline; their rectangle counts.
 */
import { MAP_KIND, type MapView, type WorldMapData, type WorldPoint } from "@/games/wow-forever/types/worldMap";
import { mapToWorld } from "@/games/wow-forever/worldMap/mapGeometry";

export const HIT_KIND = {
  /** Nothing there (open sea, or off the picture with no zone beyond). */
  none: "none",
  /** A spot on the viewed zone itself — where the player could stand. */
  here: "here",
  /** Another map: a click opens it. */
  goTo: "goTo",
} as const;
export type HitKind = (typeof HIT_KIND)[keyof typeof HIT_KIND];

export interface MapHit {
  kind: HitKind;
  /** The map a click opens (goTo), or the viewed map (here). */
  target: MapView | null;
  world: WorldPoint | null;
}

const NOTHING: MapHit = { kind: HIT_KIND.none, target: null, world: null };

const childIndex = new WeakMap<WorldMapData, Map<number, MapView[]>>();

/** The maps one level down from `mapId` (a continent's zones and cities, the world's continents and islands). */
export function childrenOf(data: WorldMapData, mapId: number): readonly MapView[] {
  let index = childIndex.get(data);
  if (!index) {
    index = new Map();
    for (const map of data.maps.values()) {
      if (map.parent === null) continue;
      const siblings = index.get(map.parent) ?? [];
      siblings.push(map);
      index.set(map.parent, siblings);
    }
    for (const list of index.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    childIndex.set(data, index);
  }
  return index.get(mapId) ?? [];
}

/** World map -> continent -> zone: the breadcrumb, top first. */
export function mapPath(data: WorldMapData, mapId: number): MapView[] {
  const path: MapView[] = [];
  let map = data.maps.get(mapId);
  while (map && path.length < data.maps.size) {
    path.unshift(map);
    map = map.parent === null ? undefined : data.maps.get(map.parent);
  }
  return path;
}

export function isZoneView(map: MapView): boolean {
  return map.kind === MAP_KIND.zone || map.kind === MAP_KIND.city;
}

function area(map: MapView): number {
  const [minX, maxX, minY, maxY] = map.regions[0].bounds;
  return (maxX - minX) * (maxY - minY);
}

/**
 * True when the point is inside this map's outline: a zone's mask, a
 * continent's zones (its highlight art is only a coastline), else the
 * rectangle (cities, islands).
 */
export function covers(data: WorldMapData, map: MapView, p: WorldPoint): boolean {
  const zone = map.zone;
  if (!zone || zone.continent !== p.continent) return false;
  const [minX, maxX, minY, maxY] = zone.bounds;
  if (p.wx < minX || p.wx > maxX || p.wy < minY || p.wy > maxY) return false;
  if (map.kind === MAP_KIND.continent) return childrenOf(data, map.id).some((child) => covers(data, child, p));
  const mask = data.masks.get(map.id);
  if (!mask) return true;
  const col = Math.min(mask.width - 1, Math.floor(((maxY - p.wy) / (maxY - minY)) * mask.width));
  const row = Math.min(mask.height - 1, Math.floor(((maxX - p.wx) / (maxX - minX)) * mask.height));
  return mask.bits[row * mask.width + col] === 1;
}

/** What a click at map percent (x, y) of `viewedId` would land on. */
export function hitTestMap(data: WorldMapData, viewedId: number, x: number, y: number): MapHit {
  const viewed = data.maps.get(viewedId);
  const world = viewed && mapToWorld(viewed, x, y);
  if (!viewed || !world) return NOTHING;
  const zoneView = isZoneView(viewed);
  let candidates: readonly MapView[] = childrenOf(data, viewed.id);
  if (zoneView && viewed.parent !== null) candidates = childrenOf(data, viewed.parent);
  const hits = candidates.filter((m) => covers(data, m, world));

  // Inside its own outline, a zone keeps the click even where a neighbour's glow overlaps.
  if (zoneView && data.masks.has(viewed.id) && hits.includes(viewed)) return { kind: HIT_KIND.here, target: viewed, world };
  let best: MapView | null = null;
  for (const hit of hits) if (!best || area(hit) < area(best)) best = hit;

  if (best && best !== viewed) return { kind: HIT_KIND.goTo, target: best, world };
  const onPicture = x >= 0 && x <= 100 && y >= 0 && y <= 100;
  // The seam between two outlines still belongs to the zone you are looking at.
  if (zoneView && onPicture) return { kind: HIT_KIND.here, target: viewed, world };
  return NOTHING;
}
