import type { FlightNode, WorldZone } from "@/games/wow-forever/types/worldMap";

/** The World Map data a dungeon page needs, already decoded: zone names/bounds and flight masters. */
export interface DungeonWorld {
  zones: readonly WorldZone[];
  flightNodes: readonly FlightNode[];
}
