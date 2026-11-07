/**
 * A hand-made route's straight-line yards, measured with the same map ↔ world
 * conversion the directions use (`mapGeometry`, `yardsBetween`). No
 * pathfinding: the trip planner does real directions.
 */
import type { MapView } from "@/games/wow-forever/types/worldMap";
import type { MapMark } from "@/games/wow-forever/types/mapMarks/mapMark";
import type { RouteDistance } from "@/games/wow-forever/types/mapMarks/routeDistance";
import { formatCoord, yardsBetween } from "@/games/wow-forever/worldMap/geometry";
import { mapToWorld } from "@/games/wow-forever/worldMap/mapGeometry";

/** Yards between consecutive stops; a leg is null where the map can't place both ends on one continent (open sea, two continents). */
export function routeDistance(map: MapView, stops: readonly MapMark[]): RouteDistance {
  const points = stops.map((s) => mapToWorld(map, s.x, s.y));
  const legs = points.slice(1).map((to, i) => {
    const from = points[i];
    if (!from || !to) return null;
    const yards = yardsBetween(from, to);
    return Number.isFinite(yards) ? yards : null;
  });
  const total = legs.length > 0 && legs.every((l) => l !== null) ? legs.reduce<number>((sum, l) => sum + (l ?? 0), 0) : null;
  return { legs, total };
}

/** "42.3, 65.1" — a map point the way players paste coordinates (one decimal, 0..100). */
export function formatMapCoords(x: number, y: number): string {
  return `${formatCoord(x)}, ${formatCoord(y)}`;
}
