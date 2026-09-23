/**
 * Zone-map percent <-> world yards. Inverse of the generator's
 * `world_to_zone` (`backend/scripts/wow_world_map/coords.py`), whose
 * conversion is pinned by wiki-verified NPC positions in its tests.
 *
 * World axes: +X is north, +Y is west. A map's x% follows -Y, y% follows -X.
 */
import type { WorldPoint, WorldZone } from "@/games/wow-forever/types/worldMap";

export function zoneToWorld(zone: WorldZone, x: number, y: number): WorldPoint {
  const [minX, maxX, minY, maxY] = zone.bounds;
  return {
    continent: zone.continent,
    wx: maxX - (y / 100) * (maxX - minX),
    wy: maxY - (x / 100) * (maxY - minY),
  };
}

export function worldToZone(zone: WorldZone, point: WorldPoint): { x: number; y: number } {
  const [minX, maxX, minY, maxY] = zone.bounds;
  return {
    x: ((maxY - point.wy) / (maxY - minY)) * 100,
    y: ((maxX - point.wx) / (maxX - minX)) * 100,
  };
}

/** True when the point is drawn on this zone's map. */
export function zoneShows(zone: WorldZone, point: WorldPoint): boolean {
  const [minX, maxX, minY, maxY] = zone.bounds;
  return (
    zone.continent === point.continent &&
    point.wx >= minX &&
    point.wx <= maxX &&
    point.wy >= minY &&
    point.wy <= maxY
  );
}

/** Straight-line yards; Infinity across continents. */
export function yardsBetween(a: WorldPoint, b: WorldPoint): number {
  if (a.continent !== b.continent) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.wx - b.wx, a.wy - b.wy);
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;
export type CompassDirection = (typeof COMPASS)[number];

/** 8-way compass heading from `from` to `to`. */
export function compassDirection(from: WorldPoint, to: WorldPoint): CompassDirection {
  const north = to.wx - from.wx;
  const east = from.wy - to.wy;
  const degrees = (Math.atan2(east, north) * 180) / Math.PI;
  const index = Math.round(((degrees + 360) % 360) / 45) % COMPASS.length;
  return COMPASS[index];
}

/** Rounded yards for reading, not measuring: ~40, ~350, ~2,400. */
export function roundYards(yards: number): number {
  if (yards < 100) return Math.max(10, Math.round(yards / 10) * 10);
  if (yards < 1000) return Math.round(yards / 50) * 50;
  return Math.round(yards / 100) * 100;
}

export function formatYards(yards: number): string {
  return `~${roundYards(yards).toLocaleString("en-US")} yd`;
}

/** Map percent with one decimal, the way the in-game coordinate addons show it. */
export function formatCoord(value: number): string {
  return value.toFixed(1);
}
