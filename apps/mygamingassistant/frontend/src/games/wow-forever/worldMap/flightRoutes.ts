/**
 * Flight routes between flight masters: fewest hops first, then shortest
 * distance — the way a player reads the flight map ("one stop to Ironforge").
 * Straight lines between flight masters; the real paths curve, which only
 * matters for the time estimate, not the route choice.
 */
import type { FlightNode, PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { yardsBetween } from "@/games/wow-forever/worldMap/geometry";

export interface FlightRoute {
  /** Node ids from start to end, both included. */
  path: readonly number[];
  hops: number;
  yards: number;
}

export function usableFlightNodes(nodes: readonly FlightNode[], faction: PlayerFaction): FlightNode[] {
  return nodes.filter((n) => n.faction === faction || n.faction === FACTION.neutral);
}

/** Every flight route from `startId` to each reachable node. */
export function flightRoutesFrom(
  startId: number,
  nodes: ReadonlyMap<number, FlightNode>,
  edges: readonly (readonly [number, number])[],
): Map<number, FlightRoute> {
  const next = new Map<number, number[]>();
  for (const [a, b] of edges) {
    if (!nodes.has(a) || !nodes.has(b)) continue;
    const list = next.get(a) ?? [];
    list.push(b);
    next.set(a, list);
  }
  const best = new Map<number, FlightRoute>([[startId, { path: [startId], hops: 0, yards: 0 }]]);
  const done = new Set<number>();
  for (;;) {
    let current: FlightRoute | undefined;
    let currentId = -1;
    for (const [id, route] of best) {
      if (done.has(id)) continue;
      if (!current || route.hops < current.hops || (route.hops === current.hops && route.yards < current.yards)) {
        current = route;
        currentId = id;
      }
    }
    if (!current) break;
    done.add(currentId);
    const from = nodes.get(currentId);
    if (!from) continue;
    for (const toId of next.get(currentId) ?? []) {
      const to = nodes.get(toId);
      if (!to || done.has(toId)) continue;
      const candidate: FlightRoute = {
        path: [...current.path, toId],
        hops: current.hops + 1,
        yards: current.yards + yardsBetween(from.world, to.world),
      };
      const known = best.get(toId);
      if (!known || candidate.hops < known.hops || (candidate.hops === known.hops && candidate.yards < known.yards)) {
        best.set(toId, candidate);
      }
    }
  }
  best.delete(startId);
  return best;
}
