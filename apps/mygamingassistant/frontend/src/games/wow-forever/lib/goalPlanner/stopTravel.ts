/**
 * The real travel model for the stop order: places come from the World Map's
 * own data (an NPC by its creature id or map id, anything else by zone and
 * map percent) and trips from its route planner — faction-aware, with your
 * flight settings. No walk graphs: their walks only shape the turn-by-turn,
 * and "Route there" opens the map for that. Trips are cached, since the
 * greedy order asks for the same pair more than once.
 */
import { OTHER_CONTINENT_YARDS } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { routeSummary } from "@/games/wow-forever/lib/ask/askTrip";
import type { PlannedLeg } from "@/games/wow-forever/types/goalPlanner/plannedLeg";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { TravelModel } from "@/games/wow-forever/types/goalPlanner/travelModel";
import type { PlayerFaction, WorldMapData, WorldZone } from "@/games/wow-forever/types/worldMap";
import { planDirections, type RouteEnd, type TravelOptions } from "@/games/wow-forever/worldMap/directions";
import { yardsBetween, zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import { findLinkedPoi } from "@/games/wow-forever/worldMap/search";
import { ENDPOINT_KIND, formatEndpoint, type Endpoint } from "@/games/wow-forever/worldMap/trip";

/** A place on the map, ready for the route planner and for a "Route there" link. */
export interface MapPlace {
  /** Unique per place: the link endpoint as text. */
  key: string;
  end: RouteEnd;
  endpoint: Endpoint;
}

/** The middle of a zone's map: where the route starts when you haven't set your spot. */
const ZONE_MIDDLE = 50;

function pointPlace(zone: WorldZone, x: number, y: number, label: string, subzone: string): MapPlace {
  const endpoint: Endpoint = { kind: ENDPOINT_KIND.point, zoneId: zone.id, x, y };
  return {
    key: formatEndpoint(endpoint),
    endpoint,
    end: { world: zoneToWorld(zone, x, y), place: { label, zoneId: zone.id, zoneName: zone.name, subzone, x, y } },
  };
}

/** "Goldshire, Elwynn Forest" → Elwynn Forest: the hand-written data's area labels end with the map they're on. */
function zoneNamed(where: string, data: WorldMapData): WorldZone | undefined {
  const name = where.split(",").pop()?.trim();
  return name ? data.zones.find((z) => z.name === name) : undefined;
}

/** Where an option is: its NPC on the map when the map has it, else its zone spot. */
function placeOption(option: StopOption, data: WorldMapData): MapPlace | null {
  const linked = option.npcId !== null ? String(option.npcId) : option.poiId;
  const poi = linked ? findLinkedPoi(linked, data) : undefined;
  const poiZone = poi ? data.zoneById.get(poi.zone) : undefined;
  if (poi && poiZone) {
    const endpoint: Endpoint = { kind: ENDPOINT_KIND.npc, poiId: poi.id };
    return {
      key: formatEndpoint(endpoint),
      endpoint,
      end: { world: zoneToWorld(poiZone, poi.x, poi.y), place: { label: poi.name, zoneId: poiZone.id, zoneName: poiZone.name, subzone: poi.subzone, x: poi.x, y: poi.y } },
    };
  }
  const zone = option.zoneId !== null ? data.zoneById.get(option.zoneId) : zoneNamed(option.where, data);
  return zone ? pointPlace(zone, option.x, option.y, option.name, "") : null;
}

/** Your saved spot, else the middle of `fallbackZone` (your faction's capital); null when neither is on the map. */
export function startPlace(
  spot: { zoneId: number | null; position: { x: number; y: number } | null },
  fallbackZone: string,
  data: WorldMapData,
): MapPlace | null {
  const saved = spot.zoneId !== null ? data.zoneById.get(spot.zoneId) : undefined;
  if (saved) {
    const x = spot.position?.x ?? ZONE_MIDDLE;
    const y = spot.position?.y ?? ZONE_MIDDLE;
    return pointPlace(saved, x, y, "Your location", "");
  }
  const capital = data.zones.find((z) => z.name === fallbackZone);
  return capital ? pointPlace(capital, ZONE_MIDDLE, ZONE_MIDDLE, capital.name, "") : null;
}

export function stopTravel(data: WorldMapData, faction: PlayerFaction, options: TravelOptions): TravelModel<MapPlace> {
  const places = new Map<string, MapPlace | null>();
  const legs = new Map<string, PlannedLeg | null>();
  return {
    at(option) {
      const key = `${option.npcId}|${option.poiId}|${option.zoneId}|${option.x}|${option.y}`;
      if (!places.has(key)) places.set(key, placeOption(option, data));
      return places.get(key) ?? null;
    },
    estimate(from, to) {
      const yards = yardsBetween(from.end.world, to.end.world);
      return Number.isFinite(yards) ? yards : OTHER_CONTINENT_YARDS;
    },
    travel(from, to) {
      const key = `${from.key}>${to.key}`;
      if (!legs.has(key)) {
        const directions = planDirections(from.end, to.end, faction, data, options);
        legs.set(key, directions ? { seconds: directions.seconds, yards: directions.yards, summary: routeSummary(directions) } : null);
      }
      return legs.get(key) ?? null;
    },
  };
}
