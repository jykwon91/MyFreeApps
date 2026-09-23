/**
 * Map percent <-> world yards on ANY map of the zoom-out tree. A zone map
 * has one region covering its whole picture (the same maths as
 * `geometry.ts`); the world map draws each continent's world rectangle in a
 * sub-rectangle of its picture (`UiMapAssignment` UiMin / UiMax).
 *
 * World axes: +X is north, +Y is west. A map's x% follows -Y, y% follows -X.
 */
import type { MapRegion, MapView, WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";

export interface MapPoint {
  x: number;
  y: number;
}

/** A rectangle in map percent. */
export interface MapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function regionToWorld(region: MapRegion, x: number, y: number): WorldPoint {
  const [u0, v0, u1, v1] = region.ui;
  const [minX, maxX, minY, maxY] = region.bounds;
  const across = (x / 100 - u0) / (u1 - u0);
  const down = (y / 100 - v0) / (v1 - v0);
  return { continent: region.continent, wx: maxX - down * (maxX - minX), wy: maxY - across * (maxY - minY) };
}

function worldToRegion(region: MapRegion, p: WorldPoint): MapPoint {
  const [u0, v0, u1, v1] = region.ui;
  const [minX, maxX, minY, maxY] = region.bounds;
  const across = (maxY - p.wy) / (maxY - minY);
  const down = (maxX - p.wx) / (maxX - minX);
  return { x: (u0 + across * (u1 - u0)) * 100, y: (v0 + down * (v1 - v0)) * 100 };
}

function regionFor(map: MapView, continent: number): MapRegion | undefined {
  return map.regions.find((r) => r.continent === continent);
}

/**
 * The world point under map percent (x, y). A single-region map (every zone
 * map) extrapolates past its edges — how the page looks just over a border;
 * on the world map a point in no continent's region (open sea) is null.
 */
export function mapToWorld(map: MapView, x: number, y: number): WorldPoint | null {
  const inside = map.regions.find(({ ui }) => x / 100 >= ui[0] && x / 100 <= ui[2] && y / 100 >= ui[1] && y / 100 <= ui[3]);
  const region = inside ?? (map.regions.length === 1 ? map.regions[0] : undefined);
  return region ? regionToWorld(region, x, y) : null;
}

/** Where a world point is drawn on this map (may be off the picture); null on another continent. */
export function worldToMap(map: MapView, p: WorldPoint): MapPoint | null {
  const region = regionFor(map, p.continent);
  return region ? worldToRegion(region, p) : null;
}

/** True when the point is inside the world rectangle this map draws. */
export function mapShows(map: MapView, p: WorldPoint): boolean {
  const region = regionFor(map, p.continent);
  if (!region) return false;
  const [minX, maxX, minY, maxY] = region.bounds;
  return p.wx >= minX && p.wx <= maxX && p.wy >= minY && p.wy <= maxY;
}

/** Where a zone's whole map rectangle falls on this map — where its highlight is drawn. */
export function projectRect(map: MapView, zone: WorldZone): MapRect | null {
  const region = regionFor(map, zone.continent);
  if (!region) return null;
  const [minX, maxX, minY, maxY] = zone.bounds;
  const topLeft = worldToRegion(region, { continent: zone.continent, wx: maxX, wy: maxY });
  const bottomRight = worldToRegion(region, { continent: zone.continent, wx: minX, wy: minY });
  return { left: topLeft.x, top: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
}
