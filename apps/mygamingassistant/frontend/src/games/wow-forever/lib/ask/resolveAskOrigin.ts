/**
 * Where "nearest" is measured from for the "Ask" chat: the place the player
 * named in the conversation (Claude passes it as `from_zone`), else their saved
 * World Map location, else nowhere. Places resolve exactly like the World Map's
 * "Where are you?" box (`bestPlaces` + `placeSpot`); a whole zone or city
 * stands for its middle, like the World Map does.
 */
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { AskOrigin } from "@/games/wow-forever/types/ask/askOrigin";
import type { WorldMapData } from "@/games/wow-forever/types/worldMap";
import { zoneToWorld } from "@/games/wow-forever/worldMap/geometry";
import type { PlayerLocation } from "@/games/wow-forever/worldMap/nearest";
import { bestPlaces, placeLabel, type Place } from "@/games/wow-forever/worldMap/places";
import { placeSpot } from "@/games/wow-forever/worldMap/where";
import { ZONE_CENTRE } from "@/games/wow-forever/worldMap/worldMapModel";

/** The place the player named ("Desolace", "goldshire"); null when nothing on the map is called that. */
export function originFromMessage(fromZone: string, places: readonly Place[]): AskOrigin | null {
  const [place] = bestPlaces(fromZone, places);
  if (place === undefined) return null;
  const position = placeSpot(place).position ?? ZONE_CENTRE;
  return { zoneId: place.zoneId, x: position.x, y: position.y, label: placeLabel(place), fromMessage: true };
}

/** The saved World Map location; null before the player has picked a zone. */
export function savedOrigin(player: PlayerSettings, world: WorldMapData): AskOrigin | null {
  if (player.zoneId === null) return null;
  const zone = world.zoneById.get(player.zoneId);
  if (zone === undefined) return null;
  const position = player.position ?? ZONE_CENTRE;
  return { zoneId: zone.id, x: position.x, y: position.y, label: zone.name, fromMessage: false };
}

export function originLocation(origin: AskOrigin | null, world: WorldMapData): PlayerLocation | null {
  if (origin === null) return null;
  const zone = world.zoneById.get(origin.zoneId);
  return zone === undefined ? null : { zone, world: zoneToWorld(zone, origin.x, origin.y) };
}
