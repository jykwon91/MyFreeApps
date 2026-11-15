/**
 * "Route there" for a stop: the World Map's own trip link (`useTrip`'s
 * params), from the stop before — or from "Your location" for the first.
 */
import { FACTION_PARAM } from "@/games/wow-forever/hooks/useFactionOverride";
import { DIR_PARAM, FROM_PARAM, TO_PARAM } from "@/games/wow-forever/hooks/useTrip";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import { formatEndpoint, type Endpoint } from "@/games/wow-forever/worldMap/trip";

const MAP_PATH = "/wow-forever/map";
const DIRECTIONS_OPEN = "1";

export function routeThereHref(to: Endpoint, from: Endpoint | null, faction: PlayerFaction): string {
  const params = new URLSearchParams();
  params.set(FACTION_PARAM, faction);
  params.set(TO_PARAM, formatEndpoint(to));
  if (from) params.set(FROM_PARAM, formatEndpoint(from));
  params.set(DIR_PARAM, DIRECTIONS_OPEN);
  return `${MAP_PATH}?${params.toString()}`;
}
