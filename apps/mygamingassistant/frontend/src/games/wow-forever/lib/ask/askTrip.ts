/**
 * The World Map's own route planner, run for each NPC an "Ask" answer might
 * list: the same travel cost orders the results, and the route's real steps
 * (walk, fly, boat or zeppelin) are what Claude and the card say about travel.
 */
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { PlayerFaction, WorldMapData } from "@/games/wow-forever/types/worldMap";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";
import {
  FLIGHT_MASTER_PREFIX,
  STEP_KIND,
  planDirections,
  type DirectionStep,
  type Directions,
  type RouteEnd,
  type WalkGraphs,
} from "@/games/wow-forever/worldMap/directions";
import { poiRouteEnd } from "@/games/wow-forever/worldMap/describeRank";
import type { PlayerLocation, RankedPoi } from "@/games/wow-forever/worldMap/nearest";

/** How many of the straight-line nearest get a planned route (planning is a search per NPC). */
export const TRIP_CANDIDATES = 10;

const SECONDS_PER_MINUTE = 60;

/** A ranked NPC with the route to it, or null when no known travel connects them. */
export interface PlannedNpc {
  ranked: RankedPoi;
  directions: Directions | null;
}

/** Every continent whose walk graph the planned routes may need. */
export function tripContinents(start: RouteEnd, candidates: readonly RankedPoi[]): number[] {
  return [...new Set([start.world.continent, ...candidates.map((c) => c.world.continent)])];
}

/** The player's spot as a route start. */
export function originRouteEnd(origin: AskOrigin, location: PlayerLocation): RouteEnd {
  return {
    world: location.world,
    place: { label: origin.label, zoneId: origin.zoneId, zoneName: location.zone.name, subzone: "", x: origin.x, y: origin.y },
  };
}

function stepWord(step: DirectionStep): string {
  if (step.kind === STEP_KIND.walk) return "walk";
  if (step.kind === STEP_KIND.fly) return `fly to ${step.place.label.replace(FLIGHT_MASTER_PREFIX, "")}`;
  return `${step.kind} to ${step.place.zoneName}`;
}

/** "walk → fly to Auberdine → boat to Teldrassil": what the route really does, in order. */
export function routeSummary(directions: Directions): string {
  const words = directions.steps.map(stepWord);
  return words.filter((w, i) => w !== "walk" || words[i - 1] !== "walk").join(" → ");
}

/** "about 6 min, ~6,100 yd" — the cost the results are ordered by, and the route's length. */
export function tripLabel(directions: Directions): string {
  const minutes = Math.max(1, Math.round(directions.seconds / SECONDS_PER_MINUTE));
  return `about ${minutes} min, ${formatYards(directions.yards)}`;
}

function cost(p: PlannedNpc): number {
  return p.directions?.seconds ?? Number.MAX_VALUE;
}

/** Plan a route to each candidate and put the cheapest trips first; an unreachable one goes last. */
export function planAndRank(
  candidates: readonly RankedPoi[],
  start: RouteEnd,
  faction: PlayerFaction,
  world: WorldMapData,
  walk: WalkGraphs,
): PlannedNpc[] {
  const planned = candidates.map((ranked) => ({
    ranked,
    directions: planDirections(start, poiRouteEnd(ranked), faction, world, undefined, walk),
  }));
  return planned.sort((a, b) => cost(a) - cost(b));
}
