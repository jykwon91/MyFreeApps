/**
 * Links out of the "Ask" chat into the World Map, built with the map's own URL
 * format (`useTrip`'s params + `formatEndpoint`). "Route there" carries a From
 * only when the player said where they are in the chat — otherwise the map's
 * "Your location" (their saved spot) is the start, as it would be on the map.
 */
import { MAP_PARAM } from "@/games/wow-forever/hooks/useMapView";
import { DIR_PARAM, FROM_PARAM, TO_PARAM } from "@/games/wow-forever/hooks/useTrip";
import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { AskPlaceRow } from "@/games/wow-forever/types/ask/askPlaceRow";
import { PLACE_KIND } from "@/games/wow-forever/worldMap/places";
import { ENDPOINT_KIND, formatEndpoint } from "@/games/wow-forever/worldMap/trip";

const MAP_PATH = "/wow-forever/map";
const DIRECTIONS_OPEN = "1";
/** Places worth routing to; a zone or city just opens its map. */
const ROUTABLE_PLACE_KINDS: ReadonlySet<string> = new Set([PLACE_KIND.town, PLACE_KIND.building, PLACE_KIND.area]);

function mapHref(params: URLSearchParams): string {
  return `${MAP_PATH}?${params.toString()}`;
}

export function routeToNpcHref(row: Pick<AskNpcRow, "poiId">, origin: AskOrigin | null): string {
  const params = new URLSearchParams();
  params.set(TO_PARAM, formatEndpoint({ kind: ENDPOINT_KIND.npc, poiId: row.poiId }));
  if (origin?.fromMessage) {
    params.set(FROM_PARAM, formatEndpoint({ kind: ENDPOINT_KIND.point, zoneId: origin.zoneId, x: origin.x, y: origin.y }));
  }
  params.set(DIR_PARAM, DIRECTIONS_OPEN);
  return mapHref(params);
}

export function isRoutablePlace(row: Pick<AskPlaceRow, "kind">): boolean {
  return ROUTABLE_PLACE_KINDS.has(row.kind);
}

export function routeToPlaceHref(row: Pick<AskPlaceRow, "placeId">): string {
  const params = new URLSearchParams();
  params.set(TO_PARAM, formatEndpoint({ kind: ENDPOINT_KIND.place, placeId: row.placeId }));
  params.set(DIR_PARAM, DIRECTIONS_OPEN);
  return mapHref(params);
}

export function zoneMapHref(zoneId: number): string {
  const params = new URLSearchParams();
  params.set(MAP_PARAM, String(zoneId));
  return mapHref(params);
}

export function dungeonHref(slug: string): string {
  return `/wow-forever/dungeons/${encodeURIComponent(slug)}`;
}
