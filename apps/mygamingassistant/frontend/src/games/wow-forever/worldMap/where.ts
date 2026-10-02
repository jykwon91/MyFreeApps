/**
 * "Where are you?" — read what the player typed into a zone + spot:
 *
 *   Stormwind City / Goldshire / SW       a place: its map, measured from its middle or town centre
 *   Old Town 78.4, 53.2                   what the minimap shows: the place picks the map
 *   42.1, 65.9                            coordinates on the zone you already picked
 *   /way Elwynn Forest 42 65, /mga way …  a waypoint command
 */
import { ZONE_KIND, type WorldMapData, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { parentZoneOf } from "@/games/wow-forever/worldMap/nearest";
import { parseCoords } from "@/games/wow-forever/worldMap/parseCoords";
import { bestPlaces, PLACE_KIND, type Place } from "@/games/wow-forever/worldMap/places";

export const WHERE_RESULT = { set: "set", choose: "choose", error: "error" } as const;

export interface WhereSpot {
  zoneId: number;
  /** null = the middle of the map. */
  position: { x: number; y: number } | null;
  /** A town centre, not a spot the player read off the game. */
  approximate: boolean;
  /** Bare coordinates put on the zone already picked — worth confirming which map they're on. */
  onCurrentZone: boolean;
}

export type WhereResult =
  | ({ kind: typeof WHERE_RESULT.set } & WhereSpot)
  | { kind: typeof WHERE_RESULT.choose; options: readonly Place[]; position: { x: number; y: number } | null }
  | { kind: typeof WHERE_RESULT.error; message: string };

const NUMBER = String.raw`(\d{1,3}(?:[.,]\d+)?)`;
/** "Old Town 78.4, 53.2", "Goldshire: 42 65" */
const PLACE_THEN_COORDS = new RegExp(String.raw`^(.*?[^\d\s,.:])[\s,:]+${NUMBER}\s*[,\s]\s*${NUMBER}$`);

const EXAMPLES = `a place like "Goldshire", or coordinates like 42.1, 65.9`;

function percent(raw: string): number | null {
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

/** The spot a place stands for: a building's floor, a town's or area's centre, else the middle of its map. */
export function placeSpot(place: Place): WhereSpot {
  const approximate = place.kind === PLACE_KIND.town || place.kind === PLACE_KIND.area;
  return { zoneId: place.zoneId, position: place.spot, approximate, onCurrentZone: false };
}

function set(spot: WhereSpot): WhereResult {
  return { kind: WHERE_RESULT.set, ...spot };
}

function fromPlaces(options: readonly Place[], position: { x: number; y: number } | null, typed: string): WhereResult {
  if (!options.length) return { kind: WHERE_RESULT.error, message: `Couldn't find "${typed}". Try ${EXAMPLES}.` };
  const maps = new Set(options.map((p) => p.zoneId));
  // Coordinates only need the map: "Old Town" in any form is Stormwind City's.
  if (position && maps.size === 1) {
    return set({ zoneId: options[0].zoneId, position, approximate: false, onCurrentZone: false });
  }
  if (!position && options.length === 1) return set(placeSpot(options[0]));
  return { kind: WHERE_RESULT.choose, options: options.slice(0, 6), position };
}

function zoneNamed(name: string, data: WorldMapData, places: readonly Place[]): WorldZone | undefined {
  const wanted = name.toLowerCase();
  const exact = data.zones.find((z) => z.name.toLowerCase() === wanted);
  if (exact) return exact;
  const [place] = bestPlaces(name, places);
  return place ? data.zoneById.get(place.zoneId) : undefined;
}

export function resolveWhere(
  text: string,
  data: WorldMapData,
  places: readonly Place[],
  currentZoneId: number | null,
): WhereResult {
  const input = text.trim();
  if (!input) return { kind: WHERE_RESULT.error, message: `Type ${EXAMPLES}.` };

  const parsed = parseCoords(input);
  if (parsed) {
    const position = { x: parsed.x, y: parsed.y };
    if (parsed.zoneName) {
      const zone = zoneNamed(parsed.zoneName, data, places);
      if (!zone) return { kind: WHERE_RESULT.error, message: `Couldn't find a zone called "${parsed.zoneName}".` };
      return set({ zoneId: zone.id, position, approximate: false, onCurrentZone: false });
    }
    if (parsed.zoneId !== undefined) {
      if (!data.zoneById.has(parsed.zoneId)) return { kind: WHERE_RESULT.error, message: `There's no map ${parsed.zoneId}.` };
      return set({ zoneId: parsed.zoneId, position, approximate: false, onCurrentZone: false });
    }
    if (currentZoneId === null) {
      return {
        kind: WHERE_RESULT.error,
        message: `Which zone are those coordinates in? Add the place your minimap shows, like "Goldshire ${input}".`,
      };
    }
    return set({ zoneId: currentZoneId, position, approximate: false, onCurrentZone: true });
  }

  const split = splitPlaceAndCoords(input);
  if (split === null) return { kind: WHERE_RESULT.error, message: "Coordinates go from 0 to 100." };
  return fromPlaces(bestPlaces(split.name, places), split.position, split.name);
}

/** "Old Town 78.4, 53.2" -> the place part + the spot; null when the numbers aren't map percent. */
export function splitPlaceAndCoords(text: string): { name: string; position: { x: number; y: number } | null } | null {
  const input = text.trim();
  const match = PLACE_THEN_COORDS.exec(input);
  if (!match) return { name: input, position: null };
  const x = percent(match[2]);
  const y = percent(match[3]);
  if (x === null || y === null) return null;
  return { name: match[1].trim(), position: { x, y } };
}


/**
 * Maps a bare pair of coordinates might really be on: a capital and the
 * zone around it share the ground but not the coordinates (78, 53 in
 * Stormwind City is nowhere near 78, 53 in Elwynn Forest).
 */
export function relatedMaps(zone: WorldZone, data: WorldMapData): WorldZone[] {
  if (zone.kind === ZONE_KIND.city) {
    const parent = parentZoneOf(zone, data.zones);
    return parent ? [parent] : [];
  }
  return data.zones.filter((z) => z.kind === ZONE_KIND.city && parentZoneOf(z, data.zones)?.id === zone.id);
}
