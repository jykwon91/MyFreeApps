/**
 * A trip, like a maps app: a destination (To) and a start (From — "Your
 * location" unless the player types another). Each end is an NPC, a place
 * from the gazetteer, or a spot on a map; all three live in the URL as text
 * (`npc:5482`, `place:town-1429-goldshire`, `pt:1429,42.1,65.9`).
 *
 * A trip never changes the saved location — only "Set as my location" does.
 */
import { FACTION, type MapPoi, type PlayerFaction, type WorldMapData, type WorldPoint, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { mapShows } from "@/games/wow-forever/worldMap/mapGeometry";
import { areaLabel } from "@/games/wow-forever/worldMap/describeRank";
import type { RouteEnd } from "@/games/wow-forever/worldMap/directions";
import { usableFlightNodes } from "@/games/wow-forever/worldMap/flightRoutes";
import { formatCoord, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { nearestTown, PLACE_KIND, placeLabel, type Place } from "@/games/wow-forever/worldMap/places";
import { findLinkedPoi } from "@/games/wow-forever/worldMap/search";

export const ENDPOINT_KIND = { npc: "npc", place: "place", point: "point" } as const;

export type Endpoint =
  | { kind: typeof ENDPOINT_KIND.npc; poiId: string }
  | { kind: typeof ENDPOINT_KIND.place; placeId: string }
  | { kind: typeof ENDPOINT_KIND.point; zoneId: number; x: number; y: number };

/** "Choose on map" — which end the next map click sets. */
export const PICK_TARGET = { start: "start", destination: "destination" } as const;
export type PickTarget = (typeof PICK_TARGET)[keyof typeof PICK_TARGET];

/** From = the saved location. */
export const MY_LOCATION = "me";
export type TripStart = Endpoint | typeof MY_LOCATION;

/** An end of the trip, placed in the world and described for the planner. */
export interface ResolvedEnd {
  route: RouteEnd;
  /** "Stephen Ryback", "Goldshire, Elwynn Forest", "Near Goldshire". */
  title: string;
  /** The NPC's title ("Cooking Trainer"). */
  subtitle: string;
  /** "Trade District, Stormwind City · 78.2, 53.1". */
  detail: string;
  /** Why the route goes to a stand-in spot (a zone has no single spot). */
  note: string | null;
  /** A spot on its own map worth zooming to; false for a whole city or zone. */
  pinpoint: boolean;
}

const POINT_PREFIX = "pt:";

export function formatEndpoint(end: Endpoint): string {
  if (end.kind === ENDPOINT_KIND.npc) return `npc:${end.poiId}`;
  if (end.kind === ENDPOINT_KIND.place) return `place:${end.placeId}`;
  return `${POINT_PREFIX}${end.zoneId},${formatCoord(end.x)},${formatCoord(end.y)}`;
}

export function parseEndpoint(text: string | null): Endpoint | null {
  if (!text) return null;
  const colon = text.indexOf(":");
  const rest = text.slice(colon + 1);
  if (colon < 0 || !rest) return null;
  const kind = text.slice(0, colon);
  if (kind === "npc") return { kind: ENDPOINT_KIND.npc, poiId: rest };
  if (kind === "place") return { kind: ENDPOINT_KIND.place, placeId: rest };
  if (kind !== "pt") return null;
  const [zoneId, x, y] = rest.split(",").map(Number);
  const onMap = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
  if (!Number.isInteger(zoneId) || !onMap(x) || !onMap(y)) return null;
  return { kind: ENDPOINT_KIND.point, zoneId, x, y };
}

export function sameEndpoint(a: TripStart | null, b: TripStart | null): boolean {
  if (a === MY_LOCATION || b === MY_LOCATION) return a === b;
  if (!a || !b) return a === b;
  return formatEndpoint(a) === formatEndpoint(b);
}

function routeEnd(zone: WorldZone, x: number, y: number, label: string, subzone: string): RouteEnd {
  return {
    world: zoneToWorld(zone, x, y),
    place: { label, zoneId: zone.id, zoneName: zone.name, subzone, x, y },
  };
}

function coords(x: number, y: number): string {
  return `${formatCoord(x)}, ${formatCoord(y)}`;
}

function npcEnd(poi: MapPoi, zone: WorldZone): ResolvedEnd {
  return {
    route: routeEnd(zone, poi.x, poi.y, poi.name, poi.subzone),
    title: poi.name,
    subtitle: poi.title,
    detail: `${areaLabel(poi, zone)} · ${coords(poi.x, poi.y)}`,
    note: null,
    pinpoint: true,
  };
}

/** Where a route to a place goes: a town's middle; a city's middle; a zone's flight master, else its main town. */
function placeEnd(place: Place, zone: WorldZone, data: WorldMapData, places: readonly Place[], faction: PlayerFaction): ResolvedEnd {
  const title = placeLabel(place);
  const end = (x: number, y: number, note: string | null, pinpoint: boolean): ResolvedEnd => ({
    route: routeEnd(zone, x, y, place.name, place.kind === PLACE_KIND.town ? place.name : ""),
    title,
    subtitle: "",
    detail: pinpoint ? `${zone.name} · ${coords(x, y)}` : zone.name,
    note,
    pinpoint,
  });
  if (place.spot) return end(place.spot.x, place.spot.y, `Routing to the middle of ${place.name}.`, true);
  if (place.kind !== PLACE_KIND.zone) return end(50, 50, `Routing to the middle of ${zone.name}.`, false);

  const flight = usableFlightNodes(data.flightNodes, faction).find((n) => n.zone === zone.id);
  if (flight) {
    const where = flight.subzone && flight.subzone !== zone.name ? ` in ${flight.subzone}` : "";
    return end(flight.x, flight.y, `${zone.name} has no single spot, so I'm routing to its flight master${where}.`, false);
  }
  const towns = places.filter((p) => p.kind === PLACE_KIND.town && p.zoneId === zone.id && p.spot);
  const main = towns.reduce<Place | null>((best, p) => ((p.size ?? 0) > (best?.size ?? -1) ? p : best), null);
  if (main?.spot) {
    return end(main.spot.x, main.spot.y, `${zone.name} has no single spot, so I'm routing to ${main.name}, its main town.`, false);
  }
  return end(50, 50, `Routing to the middle of ${zone.name}.`, false);
}

/** "Near Goldshire" / "Elwynn Forest" for a spot on a map. */
export function pointTitle(zone: WorldZone, x: number, y: number, places: readonly Place[]): string {
  const town = nearestTown(places, zone.id, x, y);
  return town ? `Near ${town.name}` : zone.name;
}

function pointEnd(zone: WorldZone, x: number, y: number, places: readonly Place[]): ResolvedEnd {
  const title = pointTitle(zone, x, y, places);
  return {
    route: routeEnd(zone, x, y, title, ""),
    title,
    subtitle: "",
    detail: `${zone.name} · ${coords(x, y)}`,
    note: null,
    pinpoint: true,
  };
}

export function resolveEndpoint(
  end: Endpoint,
  data: WorldMapData,
  places: readonly Place[],
  faction: PlayerFaction,
): ResolvedEnd | null {
  if (end.kind === ENDPOINT_KIND.npc) {
    const poi = findLinkedPoi(end.poiId, data);
    const zone = poi && data.zoneById.get(poi.zone);
    return poi && zone ? npcEnd(poi, zone) : null;
  }
  if (end.kind === ENDPOINT_KIND.place) {
    const place = places.find((p) => p.id === end.placeId);
    const zone = place && data.zoneById.get(place.zoneId);
    return place && zone ? placeEnd(place, zone, data, places, faction) : null;
  }
  const zone = data.zoneById.get(end.zoneId);
  return zone ? pointEnd(zone, end.x, end.y, places) : null;
}

/** "Your location" as a trip end. */
export function myLocationEnd(route: RouteEnd, places: readonly Place[], data: WorldMapData): ResolvedEnd | null {
  const zone = data.zoneById.get(route.place.zoneId);
  if (!zone) return null;
  const { x, y } = route.place;
  return {
    route,
    title: "Your location",
    subtitle: "",
    detail: `${pointTitle(zone, x, y, places)} · ${zone.name} ${coords(x, y)}`,
    note: null,
    pinpoint: true,
  };
}

/** The saved location as an ordinary spot, for when it swaps into To. */
export function myLocationPoint(route: RouteEnd): Endpoint {
  return { kind: ENDPOINT_KIND.point, zoneId: route.place.zoneId, x: route.place.x, y: route.place.y };
}

export const FACTION_NAME: Readonly<Record<PlayerFaction, string>> = {
  [FACTION.alliance]: "the Alliance",
  [FACTION.horde]: "the Horde",
};

function chain(data: WorldMapData, id: number): number[] {
  const ids: number[] = [];
  for (let at: number | null = id; at !== null; at = data.maps.get(at)?.parent ?? null) ids.push(at);
  return ids;
}

/**
 * The smallest map a route between zones `a` and `b` is seen on: either
 * end's own map when its picture already shows every point of the route
 * (Goldshire -> Stormwind fits on Elwynn Forest), else their nearest common
 * map (a continent, or Azeroth).
 */
export function commonMap(data: WorldMapData, a: number, b: number, points: readonly WorldPoint[] = []): number {
  const fromA = chain(data, a);
  const fromB = chain(data, b);
  const shared = new Set(fromA);
  const common = fromB.find((id) => shared.has(id)) ?? data.worldMapId;
  const showsAll = (id: number) => {
    const map = data.maps.get(id);
    return Boolean(map) && points.length > 0 && points.every((p) => map !== undefined && mapShows(map, p));
  };
  const nearer = [...fromA.slice(0, fromA.indexOf(common)), ...fromB.slice(0, fromB.indexOf(common))];
  // Smallest first: the ends' own maps before their parents.
  const depth = (id: number) => chain(data, id).length;
  return nearer.sort((x, y) => depth(y) - depth(x)).find(showsAll) ?? common;
}
