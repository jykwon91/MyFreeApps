/**
 * The stretches of a walk spent inside a cave or a building ("Defias
 * Hideout", a mine, a crypt). The zone map's art shows the surface, so a
 * route underground is an unreadable squiggle there: each such stretch gets
 * its own sketch over the floor around it, with the lines that walk it.
 */
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";
import { nodePoint, type WalkGraph, type WalkHop } from "@/games/wow-forever/worldMap/walkGraph";
import type { WalkStep } from "@/games/wow-forever/worldMap/walkSteps";

/** A stretch inside this short, in one line, needs no drawing ("Go inside and head north, ~30 yd"). */
const MIN_INSIDE_YARDS = 40;
/** How far past the route the floor is drawn. */
const GROUND_MARGIN_YARDS = 60;
/** At most this much floor around a route (a sketch, not a survey). */
const MAX_GROUND_NODES = 5000;

export interface InsideRun {
  /** Where you go in ("Defias Hideout"), "" when the ground has no name. */
  name: string;
  path: WorldPoint[];
  /** Its lines of the walk's directions, in order. */
  steps: WalkStep[];
  /** The first line's index in the walk's full list of lines. */
  firstStep: number;
  yards: number;
  /** Height at the end less the height going in, in yards. */
  climb: number;
  /** The floor around the route (graph points), drawn faintly behind it. */
  ground: WorldPoint[];
  /** The walk starts inside (you're already in there). */
  startsInside: boolean;
  /** The walk ends inside (the destination is in there). */
  endsInside: boolean;
}

function key(p: WorldPoint): string {
  return `${p.wx},${p.wy},${p.z ?? 0}`;
}

function isInside(graph: WalkGraph, label: number): boolean {
  return graph.labels[label].indoor;
}

/** Floor reachable from the route without going outside, near it. */
function groundAround(graph: WalkGraph, seeds: readonly number[], path: readonly WorldPoint[]): WorldPoint[] {
  const xs = path.map((p) => p.wx);
  const ys = path.map((p) => p.wy);
  const [x0, x1] = [Math.min(...xs) - GROUND_MARGIN_YARDS, Math.max(...xs) + GROUND_MARGIN_YARDS];
  const [y0, y1] = [Math.min(...ys) - GROUND_MARGIN_YARDS, Math.max(...ys) + GROUND_MARGIN_YARDS];
  const seen = new Set<number>(seeds);
  const queue = [...seeds];
  for (let head = 0; head < queue.length && seen.size < MAX_GROUND_NODES; head++) {
    const n = queue[head];
    for (let e = graph.start[n]; e < graph.start[n + 1]; e++) {
      const m = graph.to[e];
      if (seen.has(m) || !isInside(graph, graph.label[m])) continue;
      if (graph.x[m] < x0 || graph.x[m] > x1 || graph.y[m] < y0 || graph.y[m] > y1) continue;
      seen.add(m);
      queue.push(m);
    }
  }
  return [...seen].map((n) => nodePoint(graph, n));
}

function lengthOf(points: readonly WorldPoint[]): number {
  let yards = 0;
  for (let i = 1; i < points.length; i++) {
    yards += Math.hypot(points[i].wx - points[i - 1].wx, points[i].wy - points[i - 1].wy);
  }
  return yards;
}

/**
 * The walk's inside stretches worth a sketch. Indoors in a capital city
 * (Stormwind's buildings) only counts when the walk ends in there — the
 * streets between are told turn by turn already.
 */
export function insideRuns(graph: WalkGraph, hops: readonly WalkHop[], steps: readonly WalkStep[]): InsideRun[] {
  const nodeAt = new Map(hops.map((h) => [key(nodePoint(graph, h.node)), h.node] as const));
  const runs: InsideRun[] = [];
  let i = 0;
  while (i < steps.length) {
    if (!isInside(graph, steps[i].label)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < steps.length && isInside(graph, steps[j + 1].label)) j++;
    const run = steps.slice(i, j + 1);
    const endsInside = j === steps.length - 1;
    const path = run.flatMap((s, k) => (k === 0 ? s.points : s.points.slice(1)));
    const yards = lengthOf(path);
    const city = run.every((s) => graph.labels[s.label].city);
    if ((yards >= MIN_INSIDE_YARDS || run.length >= 2) && (!city || endsInside)) {
      const seeds = path.flatMap((p) => nodeAt.get(key(p)) ?? []);
      runs.push({
        name: graph.labels[run[0].label].name,
        path,
        steps: run,
        firstStep: i,
        yards,
        climb: (path[path.length - 1].z ?? 0) - (path[0].z ?? 0),
        ground: groundAround(graph, seeds, path),
        startsInside: i === 0,
        endsInside,
      });
    }
    i = j + 1;
  }
  return runs;
}
