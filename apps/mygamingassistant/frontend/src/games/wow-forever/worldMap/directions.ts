/**
 * Step-by-step directions: walk, fly, take a boat, zeppelin or the tram.
 *
 * A travel-time search over: the player, the destination, every flight
 * master the player can use (all, only the ones they know, or none) and every
 * dock their faction can use. Walking follows the continent's walk graph
 * (`walkGraph.ts` — ground, stairs, lifts and water from the game client)
 * when it is loaded, with sub-steps through the areas it crosses; without
 * it, or where the graph can't join two points, a walk is a straight line
 * ("head north-east ~350 yd"). A flight between two
 * flight masters follows `flightRoutesFrom` (fewest hops, then distance) and
 * becomes ONE step, since the game chains the hops for you. Speeds are rough
 * and only used to choose between walking and flying.
 */
import type {
  FlightNode,
  PlayerFaction,
  Transport,
  TransportStop,
  Vehicle,
  WorldMapData,
  WorldPoint,
} from "@/games/wow-forever/types/worldMap";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import { compassDirection, formatCoord, formatYards, yardsBetween } from "@/games/wow-forever/worldMap/geometry";
import { flightRoutesFrom, usableFlightNodes, type FlightRoute } from "@/games/wow-forever/worldMap/flightRoutes";
import { hubNodeOf, hubToHub, searchFrom, snapToGraph, type WalkGraph } from "@/games/wow-forever/worldMap/walkGraph";
import { walkLeg } from "@/games/wow-forever/worldMap/walkSteps";

/** Loaded walk graphs by continent (map id). */
export type WalkGraphs = ReadonlyMap<number, WalkGraph>;
const NO_WALK_GRAPHS: WalkGraphs = new Map();

export const STEP_KIND = { walk: "walk", fly: "fly", boat: "boat", zeppelin: "zeppelin", tram: "tram" } as const;
export type StepKind = (typeof STEP_KIND)[keyof typeof STEP_KIND];

/** Which flight paths the route may use: a new character knows none until they talk to each flight master. */
export const FLIGHT_MODE = { all: "all", known: "known", none: "none" } as const;
export type FlightMode = (typeof FLIGHT_MODE)[keyof typeof FLIGHT_MODE];

export interface TravelOptions {
  flights: FlightMode;
  /** Flight master ids the player has, for `FLIGHT_MODE.known`. */
  knownFlightIds: ReadonlySet<number>;
}

export const ALL_FLIGHTS: TravelOptions = { flights: FLIGHT_MODE.all, knownFlightIds: new Set() };

/** Where a step ends — what the step's waypoint buttons point at. */
export interface StepPlace {
  label: string;
  zoneId: number;
  zoneName: string;
  subzone: string;
  x: number;
  y: number;
}

export interface DirectionStep {
  kind: StepKind;
  text: string;
  place: StepPlace;
  /** A walk that follows the walk graph: its path on the map, start to end. */
  path?: readonly WorldPoint[];
  /** A walk's sub-steps ("Go into The Great Forge and head east, ~60 yd"). */
  detail?: readonly string[];
}

export interface Directions {
  steps: DirectionStep[];
  usesFlight: boolean;
  /** Some walk is a straight line (no walk graph there, or it can't join the two points). */
  straightWalks: boolean;
}

export interface RouteEnd {
  place: StepPlace;
  world: WorldPoint;
}

const RUN_YARDS_PER_SECOND = 7;
/** Flight paths curve and climb; a straight-line equivalent. */
const FLY_YARDS_PER_SECOND = 20;
/** Talking to the flight master, take-off and landing. */
const FLIGHT_OVERHEAD_SECONDS = 30;
/** Average wait at the dock plus the crossing (the tram's is an estimate). */
const TRANSPORT_SECONDS: Readonly<Record<Vehicle, number>> = { boat: 240, zeppelin: 240, tram: 150 };
/** Closer than this, you're already there. */
const ARRIVED_YARDS = 25;
/** A walk the walk graph can't join is assumed to wind this much more than its straight line. */
const STRAIGHT_WALK_DETOUR = 1.5;

interface GraphNode {
  end: RouteEnd;
  flight?: FlightNode;
  dock?: { transport: Transport; index: number };
  /** Its key in the walk graph's hub table (`t<flight node>`, `s<transport>.<stop>`). */
  hub?: string;
}

type Edge =
  | { kind: typeof STEP_KIND.walk }
  | { kind: typeof STEP_KIND.fly; route: FlightRoute }
  | { kind: Vehicle; transport: Transport };

interface Visit {
  seconds: number;
  prev: number;
  edge: Edge | null;
}

function zoneName(data: WorldMapData, zoneId: number): string {
  return data.zoneById.get(zoneId)?.name ?? "Unknown zone";
}

function flightPlace(data: WorldMapData, node: FlightNode): StepPlace {
  return {
    label: `the flight master at ${node.name}`,
    zoneId: node.zone,
    zoneName: zoneName(data, node.zone),
    subzone: node.subzone,
    x: node.x,
    y: node.y,
  };
}

function dockPlace(data: WorldMapData, stop: TransportStop): StepPlace {
  return { label: stop.label, zoneId: stop.zone, zoneName: zoneName(data, stop.zone), subzone: stop.subzone, x: stop.x, y: stop.y };
}

/** "Goldshire, Elwynn Forest" — coordinates only go on the last step (see `planDirections`). */
export function describePlace(place: StepPlace): string {
  if (place.subzone && place.subzone !== place.zoneName) return `${place.subzone}, ${place.zoneName}`;
  return place.zoneName;
}

/** The flight masters a route may fly between. A multi-hop flight only goes through ones you know, as in game. */
export function allowedFlightNodes(
  nodes: readonly FlightNode[],
  faction: PlayerFaction,
  options: TravelOptions,
): FlightNode[] {
  if (options.flights === FLIGHT_MODE.none) return [];
  const usable = usableFlightNodes(nodes, faction);
  if (options.flights === FLIGHT_MODE.all) return usable;
  return usable.filter((n) => options.knownFlightIds.has(n.id));
}

function buildGraph(
  start: RouteEnd,
  end: RouteEnd,
  faction: PlayerFaction,
  data: WorldMapData,
  options: TravelOptions,
): GraphNode[] {
  const graph: GraphNode[] = [{ end: start }, { end }];
  for (const node of allowedFlightNodes(data.flightNodes, faction, options)) {
    graph.push({ end: { place: flightPlace(data, node), world: node.world }, flight: node, hub: `t${node.id}` });
  }
  for (const transport of data.transports) {
    if (transport.faction !== faction && transport.faction !== FACTION.neutral) continue;
    transport.stops.forEach((stop, index) => {
      graph.push({
        end: { place: dockPlace(data, stop), world: stop.world },
        dock: { transport, index },
        hub: `s${transport.id}.${index}`,
      });
    });
  }
  return graph;
}

/**
 * Walking between the planner's graph nodes over the walk graphs: each node
 * pinned to a walk-graph node (a hub by its client position, anything else
 * snapped), costs in ground yards.
 */
class Walking {
  private readonly pinned: (number | null)[];
  /** Set once a step had to fall back to a straight line. */
  straightUsed = false;

  constructor(
    private readonly graph: readonly GraphNode[],
    private readonly walk: WalkGraphs,
  ) {
    this.pinned = graph.map((g) => {
      const wg = walk.get(g.end.world.continent);
      if (!wg) return null;
      const hub = g.hub === undefined ? null : hubNodeOf(wg, g.hub);
      return hub ?? snapToGraph(wg, g.end.world);
    });
  }

  /** The walk graph and its nodes for u -> v, or null when either end is off every graph. */
  private ends(u: number, v: number): { wg: WalkGraph; a: number; b: number } | null {
    const wg = this.walk.get(this.graph[u].end.world.continent);
    const a = this.pinned[u];
    const b = this.pinned[v];
    return wg && a !== null && b !== null ? { wg, a, b } : null;
  }

  /** Ground yards on foot, or null when the walk graph can't join them. */
  yards(u: number, v: number): number | null {
    const ends = this.ends(u, v);
    if (!ends) return null;
    const hu = this.graph[u].hub;
    const hv = this.graph[v].hub;
    if (hu !== undefined && hv !== undefined && ends.wg.hubRow.has(hu) && ends.wg.hubRow.has(hv)) {
      return hubToHub(ends.wg, hu, hv);
    }
    // Search from the trip's start / end (index 0 / 1): the same two searches serve every hub.
    const [src, dst] = v <= 1 ? [ends.b, ends.a] : [ends.a, ends.b];
    const d = searchFrom(ends.wg, src).dist[dst];
    return Number.isFinite(d) ? d : null;
  }

  seconds(u: number, v: number): number {
    const yards = this.yards(u, v);
    const straight = yardsBetween(this.graph[u].end.world, this.graph[v].end.world);
    return (yards ?? straight * STRAIGHT_WALK_DETOUR) / RUN_YARDS_PER_SECOND;
  }

  step(u: number, v: number): DirectionStep {
    const from = this.graph[u].end;
    const to = this.graph[v].end;
    const straight = yardsBetween(from.world, to.world);
    const place = describePlace(to.place);
    if (straight < ARRIVED_YARDS) {
      return { kind: STEP_KIND.walk, text: `${to.place.label} is right here — ${place}`, place: to.place };
    }
    const ends = this.ends(u, v);
    const leg = ends && walkLeg(ends.wg, ends.a, ends.b, from.world, to.world);
    if (!leg) {
      this.straightUsed = true;
      const heading = compassDirection(from.world, to.world);
      return { kind: STEP_KIND.walk, text: `Head ${heading}, ${formatYards(straight)}, to ${to.place.label} — ${place}`, place: to.place };
    }
    return {
      kind: STEP_KIND.walk,
      text: `Walk ${formatYards(leg.yards)} to ${to.place.label} — ${place}`,
      place: to.place,
      path: leg.path,
      detail: leg.detail,
    };
  }
}

function stepFor(edge: Edge, u: number, v: number, graph: readonly GraphNode[], walking: Walking): DirectionStep {
  const from = graph[u];
  const to = graph[v];
  if (edge.kind === STEP_KIND.walk) return walking.step(u, v);
  if (edge.kind === STEP_KIND.fly) {
    const via = edge.route.path.slice(1, -1).map((id) => graph.find((g) => g.flight?.id === id)?.flight?.name ?? "");
    const viaText = via.length ? ` (via ${via.join(", ")})` : "";
    return {
      kind: STEP_KIND.fly,
      text: `Fly from ${from.flight?.name ?? "here"} to ${to.flight?.name ?? "there"}${viaText}`,
      place: to.end.place,
    };
  }
  return {
    kind: edge.kind,
    text: `Take the ${edge.kind} (${edge.transport.name.replace(/^\w+: /, "")}) from ${from.end.place.label} to ${to.end.place.label} — ${describePlace(to.end.place)}`,
    place: to.end.place,
  };
}

/** "the flight master at …" leads some steps — steps read as sentences. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Plan a route, or null when no known travel connects the two places. */
export function planDirections(
  start: RouteEnd,
  end: RouteEnd,
  faction: PlayerFaction,
  data: WorldMapData,
  options: TravelOptions = ALL_FLIGHTS,
  walk: WalkGraphs = NO_WALK_GRAPHS,
): Directions | null {
  const graph = buildGraph(start, end, faction, data, options);
  const walking = new Walking(graph, walk);
  const flightIndex = new Map<number, number>();
  graph.forEach((g, i) => {
    if (g.flight) flightIndex.set(g.flight.id, i);
  });
  const flightNodes = new Map(graph.flatMap((g) => (g.flight ? [[g.flight.id, g.flight] as const] : [])));
  const routeCache = new Map<number, Map<number, FlightRoute>>();

  const visits: (Visit | undefined)[] = [{ seconds: 0, prev: -1, edge: null }];
  const done = new Set<number>();
  for (;;) {
    let u = -1;
    visits.forEach((v, i) => {
      if (v && !done.has(i) && (u < 0 || v.seconds < (visits[u]?.seconds ?? Infinity))) u = i;
    });
    if (u < 0 || u === 1) break;
    done.add(u);
    const here = graph[u];
    const seconds = visits[u]?.seconds ?? 0;
    const relax = (v: number, cost: number, edge: Edge) => {
      if (done.has(v) || v === 0) return;
      const known = visits[v];
      if (!known || seconds + cost < known.seconds) visits[v] = { seconds: seconds + cost, prev: u, edge };
    };
    graph.forEach((there, v) => {
      if (v !== u && there.end.world.continent === here.end.world.continent) {
        relax(v, walking.seconds(u, v), { kind: STEP_KIND.walk });
      }
    });
    if (here.flight) {
      let routes = routeCache.get(here.flight.id);
      if (!routes) {
        routes = flightRoutesFrom(here.flight.id, flightNodes, data.flightEdges);
        routeCache.set(here.flight.id, routes);
      }
      for (const [toId, route] of routes) {
        const v = flightIndex.get(toId);
        if (v === undefined) continue;
        relax(v, route.yards / FLY_YARDS_PER_SECOND + FLIGHT_OVERHEAD_SECONDS, { kind: STEP_KIND.fly, route });
      }
    }
    if (here.dock) {
      const { transport, index } = here.dock;
      graph.forEach((there, v) => {
        if (there.dock?.transport.id === transport.id && there.dock.index !== index) {
          relax(v, TRANSPORT_SECONDS[transport.vehicle], { kind: transport.vehicle, transport });
        }
      });
    }
  }

  if (!visits[1]) return null;
  const steps: DirectionStep[] = [];
  for (let v = 1; v > 0; ) {
    const visit = visits[v];
    if (!visit || !visit.edge) break;
    const step = stepFor(visit.edge, visit.prev, v, graph, walking);
    steps.unshift({ ...step, text: sentence(step.text) });
    v = visit.prev;
  }
  // Where you end up is the one spot worth reading coordinates for.
  const last = steps[steps.length - 1];
  if (last) last.text = `${last.text} (${formatCoord(last.place.x)}, ${formatCoord(last.place.y)})`;
  return {
    steps,
    usesFlight: steps.some((s) => s.kind === STEP_KIND.fly),
    straightWalks: walking.straightUsed,
  };
}
