import type { MapPoi, WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { formatYards } from "@/games/wow-forever/worldMap/geometry";
import { NEAR_GROUP, type NearGroup, type RankedPoi } from "@/games/wow-forever/worldMap/nearest";
import type { RouteEnd } from "@/games/wow-forever/worldMap/directions";
import type { WaypointTarget } from "@/games/wow-forever/worldMap/waypoints";

export const GROUP_HEADING: Readonly<Record<NearGroup, string>> = {
  sameArea: "Near you",
  sameContinent: "Elsewhere on this continent",
  otherContinent: "Another continent — boat or zeppelin needed",
};

/** "~350 yd away" / "~6,400 yd away on Eastern Kingdoms" / "Kalimdor — boat or zeppelin needed". */
export function distanceLabel(ranked: RankedPoi, data: WorldMapData): string {
  const continent = data.continentNames.get(ranked.world.continent) ?? "another continent";
  if (ranked.group === NEAR_GROUP.otherContinent || ranked.yards === null) {
    return `${continent} — boat or zeppelin needed`;
  }
  if (ranked.group === NEAR_GROUP.sameArea) return `${formatYards(ranked.yards)} away`;
  return `${formatYards(ranked.yards)} away, elsewhere on ${continent}`;
}

/** "Goldshire, Elwynn Forest" — sub-zone first when the map names one. */
export function areaLabel(poi: Pick<MapPoi, "subzone">, zone: WorldZone): string {
  return poi.subzone && poi.subzone !== zone.name ? `${poi.subzone}, ${zone.name}` : zone.name;
}

export function poiWaypoint(ranked: RankedPoi): WaypointTarget {
  return { zoneId: ranked.zone.id, zoneName: ranked.zone.name, x: ranked.poi.x, y: ranked.poi.y, label: ranked.poi.name };
}

export function poiRouteEnd(ranked: RankedPoi): RouteEnd {
  return {
    world: ranked.world,
    place: {
      label: ranked.poi.name,
      zoneId: ranked.zone.id,
      zoneName: ranked.zone.name,
      subzone: ranked.poi.subzone,
      x: ranked.poi.x,
      y: ranked.poi.y,
    },
  };
}
