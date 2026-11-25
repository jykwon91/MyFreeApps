import { SERVICE_KIND } from "@/games/wow-forever/data/worldMap/serviceKinds";
import { POI_KIND, POI_SOURCE, type FlightNode, type MapPoi } from "@/games/wow-forever/types/worldMap";

/** A flight point this close (map percent, same zone) to a known flight master is that flight master. */
export const FLIGHT_MASTER_MATCH_PCT = 3;

const FLIGHT_POINT_TITLE = "Flight point";

function hasFlightMasterAt(node: FlightNode, services: readonly MapPoi[]): boolean {
  return services.some(
    (poi) =>
      poi.subkind === SERVICE_KIND.flightMaster &&
      poi.zone === node.zone &&
      Math.hypot(poi.x - node.x, poi.y - node.y) <= FLIGHT_MASTER_MATCH_PCT,
  );
}

/** "Summit of Eternity, Mount Hyjal" → "Summit of Eternity": the flight point's own name, without its zone. */
function pointName(node: FlightNode, zoneName: string | undefined): string {
  const suffix = zoneName ? `, ${zoneName}` : "";
  return suffix && node.name.endsWith(suffix) ? node.name.slice(0, -suffix.length) : node.name;
}

/**
 * Flight masters the Classic NPC table doesn't have (Mount Hyjal, Riverglades,
 * a few Classic towns): the game's flight map lists them, so they're NPCs to
 * the search, the layers and directions too. The client names the flight
 * point, never the NPC, so that's the name shown.
 */
export function flightMasterPois(
  nodes: readonly FlightNode[],
  services: readonly MapPoi[],
  zoneNames: ReadonlyMap<number, string>,
): MapPoi[] {
  return nodes
    .filter((node) => !hasFlightMasterAt(node, services))
    .map((node) => ({
      id: `flight-${node.id}`,
      kind: POI_KIND.service,
      subkind: SERVICE_KIND.flightMaster,
      tag: "",
      name: pointName(node, zoneNames.get(node.zone)),
      title: FLIGHT_POINT_TITLE,
      zone: node.zone,
      subzone: node.subzone,
      x: node.x,
      y: node.y,
      faction: node.faction,
      source: POI_SOURCE.gameFiles,
    }));
}
