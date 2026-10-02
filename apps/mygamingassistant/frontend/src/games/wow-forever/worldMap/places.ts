/**
 * The gazetteer: every place name a player might type — zones, capital
 * cities, their districts, and the towns / camps named in the map data
 * ("Goldshire", "The Crossroads").
 *
 * A town's spot is the middle of the NPCs, quest givers and flight masters
 * the data puts there, so it's approximate. A zone, city or district has no
 * spot of its own: we measure from the middle of its map.
 *
 * Buildings ("Deepwater Tavern") and named areas no NPC stands in ("Menethil
 * Keep") come from the client's walk data (`areas.json`): a spot on their
 * floor, with its height.
 */
import { CITY_DISTRICTS, ZONE_ALIASES } from "@/games/wow-forever/data/worldMap/placeNames";
import { ZONE_KIND, type WorldMapData, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { matchesAll, nameScore, normalizeText, queryTokens } from "@/games/wow-forever/worldMap/searchText";

export const PLACE_KIND = {
  city: "city",
  zone: "zone",
  district: "district",
  town: "town",
  building: "building",
  area: "area",
} as const;
export type PlaceKind = (typeof PLACE_KIND)[keyof typeof PLACE_KIND];

/** Cities before zones before towns before districts before buildings and areas when names score the same. */
const KIND_ORDER: Readonly<Record<PlaceKind, number>> = { city: 0, zone: 1, town: 2, district: 3, building: 4, area: 5 };

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  /** The map it's on (a district is on its city's map). */
  zoneId: number;
  zoneName: string;
  /** Map percent on `zoneId`; null = the whole map. */
  spot: { x: number; y: number } | null;
  aliases: readonly string[];
  /** Towns: how many NPCs / quest givers / flight masters the data puts there (its "main town" weight). */
  size?: number;
  /** Buildings and areas: the world height of the spot, so a route ends on its floor. */
  z?: number;
  /** Buildings and areas: the town they're in or next to ("Menethil Harbor"). */
  town?: string;
}

/** "Goldshire, Elwynn Forest" / "Stormwind City". */
export function placeLabel(place: Place): string {
  if (place.kind === PLACE_KIND.city || place.kind === PLACE_KIND.zone) return place.name;
  if (place.town) return `${place.name}, ${place.town}, ${place.zoneName}`;
  return `${place.name}, ${place.zoneName}`;
}

interface Spot {
  subzone: string;
  zone: number;
  x: number;
  y: number;
}

function zonePlace(zone: WorldZone): Place {
  return {
    id: `zone-${zone.id}`,
    name: zone.name,
    kind: zone.kind === ZONE_KIND.city ? PLACE_KIND.city : PLACE_KIND.zone,
    zoneId: zone.id,
    zoneName: zone.name,
    spot: null,
    aliases: ZONE_ALIASES[zone.name] ?? [],
  };
}

/** Towns: every named sub-zone in the data, at the middle of what's there. */
function townPlaces(data: WorldMapData, taken: ReadonlySet<string>): Place[] {
  const spots: Spot[] = [...data.pois, ...data.questGivers, ...data.flightNodes];
  const groups = new Map<string, Spot[]>();
  for (const spot of spots) {
    const zone = data.zoneById.get(spot.zone);
    if (!spot.subzone || !zone || spot.subzone === zone.name) continue;
    const key = `${spot.zone}|${spot.subzone}`;
    if (taken.has(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(spot);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => {
    const zone = data.zoneById.get(list[0].zone) as WorldZone;
    const x = list.reduce((sum, s) => sum + s.x, 0) / list.length;
    const y = list.reduce((sum, s) => sum + s.y, 0) / list.length;
    return {
      id: `town-${zone.id}-${normalizeText(list[0].subzone)}`,
      name: list[0].subzone,
      kind: PLACE_KIND.town,
      zoneId: zone.id,
      zoneName: zone.name,
      spot: { x, y },
      aliases: [],
      size: list.length,
    };
  });
}

/** Buildings and named areas from the walk data that aren't already a town, district or map. */
function areaPlaces(data: WorldMapData, known: readonly Place[]): Place[] {
  const taken = new Set(known.map((p) => `${p.zoneId}|${normalizeText(p.name)}`));
  const out: Place[] = [];
  for (const area of data.areas) {
    const zone = data.zoneById.get(area.zone);
    const key = `${area.zone}|${normalizeText(area.name)}`;
    if (!zone || taken.has(key)) continue;
    taken.add(key);
    const town = nearestTown(known, zone.id, area.x, area.y);
    out.push({
      id: `area-${zone.id}-${normalizeText(area.name)}`,
      name: area.name,
      kind: area.indoor ? PLACE_KIND.building : PLACE_KIND.area,
      zoneId: zone.id,
      zoneName: zone.name,
      spot: { x: area.x, y: area.y },
      aliases: [],
      z: area.z,
      town: town?.name,
    });
  }
  return out;
}

export function buildPlaces(data: WorldMapData): Place[] {
  const places: Place[] = [];
  const taken = new Set<string>();
  // "Ironforge" the sub-zone outside the gates is Ironforge the city to anyone typing it.
  const mapNames = new Set(data.zones.map((z) => z.name));
  for (const zone of data.zones) {
    if (zone.kind === ZONE_KIND.continent) continue;
    places.push(zonePlace(zone));
    for (const district of CITY_DISTRICTS[zone.name] ?? []) {
      taken.add(`${zone.id}|${district}`);
      places.push({
        id: `district-${zone.id}-${normalizeText(district)}`,
        name: district,
        kind: PLACE_KIND.district,
        zoneId: zone.id,
        zoneName: zone.name,
        spot: null,
        aliases: [],
      });
    }
  }
  const known = [...places, ...townPlaces(data, taken).filter((town) => !mapNames.has(town.name))];
  return [...known, ...areaPlaces(data, known)];
}

/** How well a place answers the query, or null when it doesn't. Lower is better. */
function placeScore(place: Place, query: string, tokens: readonly string[]): number | null {
  const q = normalizeText(query);
  // Short aliases ("SW", "IF") only count typed in full; longer ones as a prefix too.
  const aliases = place.aliases.map(normalizeText);
  if (aliases.includes(q)) return 0;
  if (q.length >= 3 && aliases.some((a) => a.startsWith(q))) return 1;
  const own = normalizeText(place.name);
  if (matchesAll(tokens, own)) return nameScore(place.name, query);
  // "old town stormwind", "goldshire elwynn": the rest of the words name the map.
  // "tavern menethil": a building's town counts too.
  const where = `${normalizeText(place.town ?? "")} ${normalizeText(place.zoneName)} ${aliases.join(" ")}`;
  if (matchesAll(tokens, `${own} ${where}`)) return 4;
  return null;
}

/** Places matching what was typed, best first. */
export function findPlaces(query: string, places: readonly Place[], limit = 6): Place[] {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  const scored: { place: Place; score: number }[] = [];
  for (const place of places) {
    const score = placeScore(place, query, tokens);
    if (score !== null) scored.push({ place, score });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      KIND_ORDER[a.place.kind] - KIND_ORDER[b.place.kind] ||
      a.place.name.localeCompare(b.place.name),
  );
  return scored.slice(0, limit).map((s) => s.place);
}

/** The best matches only — everything that scored as well as the top one. */
export function bestPlaces(query: string, places: readonly Place[]): Place[] {
  const tokens = queryTokens(query);
  const found = findPlaces(query, places, 50);
  if (!found.length) return [];
  const top = placeScore(found[0], query, tokens);
  return found.filter((p) => placeScore(p, query, tokens) === top);
}

/** The town nearest a spot on the same map, if one is close enough to name. */
export function nearestTown(places: readonly Place[], zoneId: number, x: number, y: number): Place | null {
  const NAMEABLE = 8;
  let best: Place | null = null;
  let bestDistance = NAMEABLE;
  for (const place of places) {
    if (place.kind !== PLACE_KIND.town || place.zoneId !== zoneId || !place.spot) continue;
    const distance = Math.hypot(place.spot.x - x, place.spot.y - y);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}
