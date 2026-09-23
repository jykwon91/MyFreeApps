/**
 * Step-by-step directions: walk, fly, take a boat or zeppelin.
 *
 * A travel-time search over: the player, the destination, every flight
 * master and dock the player's faction can use. Walking is a straight line
 * (no terrain / navmesh — "head north-east ~350 yd"). A flight between two
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

export const STEP_KIND = { walk: "walk", fly: "fly", boat: "boat", zeppelin: "zeppelin" } as const;
export type StepKind = (typeof STEP_KIND)[keyof typeof STEP_KIND];

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
}

export interface Directions {
  steps: DirectionStep[];
  usesFlight: boolean;
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
/** Average wait at the dock plus the crossing. */
const TRANSPORT_SECONDS = 240;
/** Closer than this, you're already there. */
const ARRIVED_YARDS = 25;

interface GraphNode {
  end: RouteEnd;
  flight?: FlightNode;
  dock?: { transport: Transport; index: number };
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
    label: `the ${node.name} flight master`,
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

/** "Goldshire, Elwynn Forest (44.4, 66.2)" */
export function describePlace(place: StepPlace): string {
  const area = place.subzone && place.subzone !== place.zoneName ? `${place.subzone}, ${place.zoneName}` : place.zoneName;
  return `${area} (${formatCoord(place.x)}, ${formatCoord(place.y)})`;
}

function buildGraph(start: RouteEnd, end: RouteEnd, faction: PlayerFaction, data: WorldMapData): GraphNode[] {
  const graph: GraphNode[] = [{ end: start }, { end }];
  for (const node of usableFlightNodes(data.flightNodes, faction)) {
    graph.push({ end: { place: flightPlace(data, node), world: node.world }, flight: node });
  }
  for (const transport of data.transports) {
    if (transport.faction !== faction && transport.faction !== FACTION.neutral) continue;
    transport.stops.forEach((stop, index) => {
      graph.push({ end: { place: dockPlace(data, stop), world: stop.world }, dock: { transport, index } });
    });
  }
  return graph;
}

function walkText(from: RouteEnd, to: RouteEnd): string {
  const yards = yardsBetween(from.world, to.world);
  if (yards < ARRIVED_YARDS) return `${to.place.label} is right here — ${describePlace(to.place)}`;
  return `Head ${compassDirection(from.world, to.world)}, ${formatYards(yards)}, to ${to.place.label} — ${describePlace(to.place)}`;
}

function stepFor(edge: Edge, from: GraphNode, to: GraphNode, graph: readonly GraphNode[]): DirectionStep {
  if (edge.kind === STEP_KIND.walk) {
    return { kind: STEP_KIND.walk, text: walkText(from.end, to.end), place: to.end.place };
  }
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

/** Plan a route, or null when no known travel connects the two places. */
export function planDirections(
  start: RouteEnd,
  end: RouteEnd,
  faction: PlayerFaction,
  data: WorldMapData,
): Directions | null {
  const graph = buildGraph(start, end, faction, data);
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
        relax(v, yardsBetween(here.end.world, there.end.world) / RUN_YARDS_PER_SECOND, { kind: STEP_KIND.walk });
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
          relax(v, TRANSPORT_SECONDS, { kind: transport.vehicle, transport });
        }
      });
    }
  }

  if (!visits[1]) return null;
  const steps: DirectionStep[] = [];
  for (let v = 1; v > 0; ) {
    const visit = visits[v];
    if (!visit || !visit.edge) break;
    steps.unshift(stepFor(visit.edge, graph[visit.prev], graph[v], graph));
    v = visit.prev;
  }
  return { steps, usesFlight: steps.some((s) => s.kind === STEP_KIND.fly) };
}
