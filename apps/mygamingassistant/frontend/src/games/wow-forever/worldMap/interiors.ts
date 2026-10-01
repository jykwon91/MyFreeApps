/**
 * Inside a dungeon or raid: the bosses an entrance leads to, in kill order,
 * and the walk to each — from the entrance or from the boss before it —
 * over the dungeon's walk graph (`public/wow-walk/<instance map id>.walk`).
 *
 * `classicInteriors.json` (cmangos classic-db, GPL — see the folder's
 * README) holds where each entrance puts you, each boss's spawn (the
 * Forever client's encounter list and order) and the doors that need a key.
 * A boss belongs to the entrance it's the shortest walk from, so a dungeon
 * with several entrances (Scarlet Monastery's wings, Dire Maul, Stratholme's
 * two gates) lists each boss once, under the door you'd use.
 */
import type { WorldPoint } from "@/games/wow-forever/types/worldMap";
import {
  hubNodeOf,
  hubToHub,
  nodePoint,
  searchFrom,
  walkPath,
  type WalkGraph,
} from "@/games/wow-forever/worldMap/walkGraph";
import { walkSteps } from "@/games/wow-forever/worldMap/walkSteps";

export interface InteriorBoss {
  encounter: number;
  name: string;
  /** Where it stands; null when it has no fixed spawn (summoned, or brought out by an event). */
  point: WorldPoint | null;
  /** How many places it can spawn in (a rare spawn); 1 for most. */
  spots: number;
}

export interface InteriorDoor {
  point: WorldPoint;
  /** The key that opens it: "Skeleton Key". */
  key: string;
}

export interface Interior {
  mapId: number;
  /** Area trigger id of each entrance -> where it puts you inside. */
  entrances: ReadonlyMap<number, WorldPoint>;
  bosses: readonly InteriorBoss[];
  doors: readonly InteriorDoor[];
}

export interface InteriorsFile {
  entranceColumns: string[];
  bossColumns: string[];
  doorColumns: string[];
  instances: Record<string, { entrances: unknown[][]; bosses: unknown[][]; doors: unknown[][] }>;
}

function columns(names: readonly string[], wanted: readonly string[]): number[] {
  return wanted.map((w) => {
    const i = names.indexOf(w);
    if (i < 0) throw new Error(`classicInteriors.json: missing column ${w}`);
    return i;
  });
}

function point(mapId: number, x: unknown, y: unknown, z: unknown): WorldPoint | null {
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  return { continent: mapId, wx: x, wy: y, z };
}

/** Instance map id -> its interior. */
export function decodeInteriors(file: InteriorsFile): ReadonlyMap<number, Interior> {
  const [eTrigger, eX, eY, eZ] = columns(file.entranceColumns, ["trigger", "x", "y", "z"]);
  const [bEnc, bName, bX, bY, bZ, bSpots] = columns(file.bossColumns, ["encounter", "name", "x", "y", "z", "spots"]);
  const [dX, dY, dZ, dKey] = columns(file.doorColumns, ["x", "y", "z", "key"]);
  const out = new Map<number, Interior>();
  for (const [id, raw] of Object.entries(file.instances)) {
    const mapId = Number(id);
    const entrances = new Map<number, WorldPoint>();
    for (const r of raw.entrances) {
      const p = point(mapId, r[eX], r[eY], r[eZ]);
      if (p) entrances.set(Number(r[eTrigger]), p);
    }
    const bosses = raw.bosses.map((r) => ({
      encounter: Number(r[bEnc]),
      name: String(r[bName]),
      point: point(mapId, r[bX], r[bY], r[bZ]),
      spots: Number(r[bSpots]),
    }));
    const doors: InteriorDoor[] = [];
    for (const r of raw.doors) {
      const p = point(mapId, r[dX], r[dY], r[dZ]);
      if (p) doors.push({ point: p, key: String(r[dKey]) });
    }
    out.set(mapId, { mapId, entrances, bosses, doors });
  }
  return out;
}

let cached: Promise<ReadonlyMap<number, Interior>> | null = null;

/** The interiors data, loaded once (its own chunk: only an opened "Inside" section needs it). */
export function loadInteriors(): Promise<ReadonlyMap<number, Interior>> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/worldMap/classic/classicInteriors.json").then((m) =>
      decodeInteriors(m.default as InteriorsFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

export const ROUTE_FROM = { previous: "previous", entrance: "entrance" } as const;
export type RouteFrom = (typeof ROUTE_FROM)[keyof typeof ROUTE_FROM];

export const BOSS_ROUTE = { route: "route", unplaced: "unplaced", unreachable: "unreachable" } as const;
export type BossRouteStatus = (typeof BOSS_ROUTE)[keyof typeof BOSS_ROUTE];

export interface InteriorStep {
  text: string;
  points: WorldPoint[];
  /** A locked door on this stretch: the key it needs. */
  door: string | null;
}

export interface BossRoute {
  boss: InteriorBoss;
  status: BossRouteStatus;
  /** The boss the walk starts at; null = the entrance. */
  fromBoss: InteriorBoss | null;
  /** Yards walked (plan view). */
  yards: number;
  /** Start to boss. */
  path: WorldPoint[];
  steps: InteriorStep[];
}

/** A locked door this close to the path (across / up or down) is on the way. */
const DOOR_YARDS = 8;
const DOOR_HEIGHT_YARDS = 6;

function nearSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): boolean {
  const dx = b.wx - a.wx;
  const dy = b.wy - a.wy;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.wx - a.wx) * dx + (p.wy - a.wy) * dy) / len2)) : 0;
  const z = (a.z ?? 0) + t * ((b.z ?? 0) - (a.z ?? 0));
  return (
    Math.hypot(p.wx - (a.wx + t * dx), p.wy - (a.wy + t * dy)) <= DOOR_YARDS &&
    Math.abs((p.z ?? 0) - z) <= DOOR_HEIGHT_YARDS
  );
}

/** The key of the first locked door this stretch goes by whose key wasn't needed earlier on the route. */
function doorOn(points: readonly WorldPoint[], doors: readonly InteriorDoor[], needed: Set<string>): string | null {
  for (const door of doors) {
    if (needed.has(door.key)) continue;
    for (let i = 1; i < points.length; i++) {
      if (nearSegment(door.point, points[i - 1], points[i])) {
        needed.add(door.key);
        return door.key;
      }
    }
  }
  return null;
}

function planYards(path: readonly WorldPoint[]): number {
  let yards = 0;
  for (let i = 1; i < path.length; i++) yards += Math.hypot(path[i].wx - path[i - 1].wx, path[i].wy - path[i - 1].wy);
  return yards;
}

/** The entrance (of this dungeon's) a boss is the shortest walk from, or null when none reaches it. */
function homeEntrance(graph: WalkGraph, interior: Interior, boss: InteriorBoss): number | null {
  let best: number | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const trigger of interior.entrances.keys()) {
    const cost = hubToHub(graph, `e${trigger}`, `b${boss.encounter}`);
    if (cost !== null && cost < bestCost) {
      best = trigger;
      bestCost = cost;
    }
  }
  return best;
}

function walk(graph: WalkGraph, doors: readonly InteriorDoor[], from: number, to: number) {
  const hops = walkPath(graph, from, to);
  if (!hops) return null;
  const path = hops.map((h) => nodePoint(graph, h.node));
  // Each key is flagged once, on the first step that reaches a door it opens — not on
  // every step along the door, nor again at a gate's other half.
  const needed = new Set<string>();
  const steps = walkSteps(graph, hops).map((s) => ({ ...s, door: doorOn(s.points, doors, needed) }));
  return { path, steps, yards: planYards(path) };
}

/**
 * The bosses behind entrance `trigger`, in kill order, each with its walk.
 * Bosses with no fixed spawn come last ("unplaced"); a placed boss no
 * entrance reaches is "unreachable" (a gap in the walk graph — never a
 * straight line through the walls).
 */
export function interiorRoutes(graph: WalkGraph, interior: Interior, trigger: number, from: RouteFrom): BossRoute[] {
  const entranceNode = hubNodeOf(graph, `e${trigger}`);
  const routes: BossRoute[] = [];
  const unplaced: BossRoute[] = [];
  let previous: { boss: InteriorBoss; node: number } | null = null;
  for (const boss of interior.bosses) {
    const empty = { boss, fromBoss: null, yards: 0, path: [], steps: [] };
    if (!boss.point) {
      unplaced.push({ ...empty, status: BOSS_ROUTE.unplaced });
      continue;
    }
    const home = homeEntrance(graph, interior, boss);
    if (home === null) {
      // Show it under every entrance: it's in this dungeon, we just can't walk there.
      routes.push({ ...empty, status: BOSS_ROUTE.unreachable });
      continue;
    }
    const bossNode = hubNodeOf(graph, `b${boss.encounter}`);
    if (home !== trigger || entranceNode === null || bossNode === null) continue;
    const start = from === ROUTE_FROM.previous && previous ? previous : null;
    const leg = walk(graph, interior.doors, start ? start.node : entranceNode, bossNode);
    if (leg) routes.push({ boss, status: BOSS_ROUTE.route, fromBoss: start?.boss ?? null, ...leg });
    else routes.push({ ...empty, status: BOSS_ROUTE.unreachable });
    previous = { boss, node: bossNode };
  }
  return [...routes, ...unplaced];
}

/** The walkable ground an entrance reaches (graph node points) — the schematic's backdrop. */
export function reachableGround(graph: WalkGraph, trigger: number): WorldPoint[] {
  const source = hubNodeOf(graph, `e${trigger}`);
  if (source === null) return [];
  const { dist } = searchFrom(graph, source);
  const out: WorldPoint[] = [];
  for (let i = 0; i < graph.size; i++) if (Number.isFinite(dist[i])) out.push(nodePoint(graph, i));
  return out;
}

/** Where entrance `trigger` puts you, as a graph point (or the trigger's own target when off the graph). */
export function entrancePoint(graph: WalkGraph, interior: Interior, trigger: number): WorldPoint | null {
  const node = hubNodeOf(graph, `e${trigger}`);
  return node === null ? (interior.entrances.get(trigger) ?? null) : nodePoint(graph, node);
}
