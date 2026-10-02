/**
 * "Show all on the map": every NPC a search matches ("warlock trainer",
 * "flight master", "innkeeper") as a list and as markers on every map level,
 * with the view fitted to the smallest map that holds them all.
 */
import type { PlayerFaction, WorldMapData, WorldPoint } from "@/games/wow-forever/types/worldMap";
import type { MapFit, MapMarker } from "@/games/wow-forever/worldMap/mapLayers";
import { mapPath } from "@/games/wow-forever/worldMap/mapHitTest";
import { NEAR_GROUP, locatePoi, rankPois, usableBy, type PlayerLocation, type RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import { poiMarkerClass, poiMarkerLabel } from "@/games/wow-forever/worldMap/poiDisplay";
import type { NpcHit } from "@/games/wow-forever/worldMap/search";

export interface MapSearch {
  /** What was typed ("warlock trainer"). */
  query: string;
  hits: readonly NpcHit[];
}

export interface MapSearchView {
  /** The ones shown: your faction's and neutral, or everyone's when asked. */
  results: RankedPoi[];
  /** Matches left out because they're the other faction's. */
  otherFactionCount: number;
}

/** Nearest first when you've said where you are; else by continent, zone and name. */
function rank(hits: readonly NpcHit[], data: WorldMapData, player: PlayerLocation | null): RankedPoi[] {
  const pois = hits.map((h) => h.poi);
  if (player) return rankPois(pois, player, data);
  const ranked: RankedPoi[] = [];
  for (const poi of pois) {
    const located = locatePoi(poi, data);
    if (located) ranked.push({ poi, ...located, group: NEAR_GROUP.sameContinent, yards: null });
  }
  const continent = (r: RankedPoi) => data.continentNames.get(r.world.continent) ?? "";
  return ranked.sort(
    (a, b) =>
      continent(a).localeCompare(continent(b)) || a.zone.name.localeCompare(b.zone.name) || a.poi.name.localeCompare(b.poi.name),
  );
}

export function viewMapSearch(
  search: MapSearch,
  data: WorldMapData,
  faction: PlayerFaction,
  player: PlayerLocation | null,
  includeOtherFaction: boolean,
): MapSearchView {
  const ours = search.hits.filter((h) => usableBy(h.poi, faction, false));
  // Nothing on your side ("orgrimmar flight master" as Alliance): show theirs rather than nothing.
  const showAll = includeOtherFaction || ours.length === 0;
  const shown = showAll ? search.hits : ours;
  return { results: rank(shown, data, player), otherFactionCount: showAll ? 0 : search.hits.length - ours.length };
}

/** How many of the matches you'd see by default — the number "Show all N on the map" promises. */
export function defaultResultCount(hits: readonly NpcHit[], faction: PlayerFaction): number {
  const ours = hits.filter((h) => usableBy(h.poi, faction, false)).length;
  return ours || hits.length;
}

export function searchMarkers(results: readonly RankedPoi[]): MapMarker[] {
  return results.map((r) => ({
    id: r.poi.id,
    world: r.world,
    label: poiMarkerLabel(r.poi),
    className: poiMarkerClass(r.poi),
    zoneId: r.zone.id,
  }));
}

/** The deepest map every result's zone sits on: their zone, a continent, or Azeroth. */
export function commonMapOf(data: WorldMapData, zoneIds: readonly number[]): number {
  const paths = [...new Set(zoneIds)].map((id) => mapPath(data, id).map((m) => m.id));
  if (!paths.length) return data.worldMapId;
  let common = data.worldMapId;
  for (let depth = 0; depth < paths[0].length; depth++) {
    const id = paths[0][depth];
    if (!paths.every((p) => p[depth] === id)) break;
    common = id;
  }
  return common;
}

/** Zoom so every result shows: on the smallest map holding them all. */
export function fitResults(data: WorldMapData, results: readonly RankedPoi[]): MapFit | null {
  if (!results.length) return null;
  const mapId = commonMapOf(
    data,
    results.map((r) => r.zone.id),
  );
  const points: WorldPoint[] = results.map((r) => r.world);
  return data.maps.has(mapId) ? { mapId, points, nonce: Date.now() } : null;
}
