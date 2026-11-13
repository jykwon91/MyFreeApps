import type { DungeonDoor } from "@/games/wow-forever/types/dungeons/dungeonDoor";
import type { DungeonFlightPath } from "@/games/wow-forever/types/dungeons/dungeonFlightPath";

/** The zone a dungeon's door (or doors) are in — for a new Forever dungeon, the zone of the area the game puts it in. */
export interface DungeonEntranceZone {
  /** uiMapID — the World Map's `?m=`. */
  zoneId: number;
  zoneName: string;
  /** The area the door is in ("The Dagger Hills"), when it has one; a new Forever dungeon's area. */
  subzone: string;
  /** Its doors in this zone, in the entrances file's order; empty when only the area is known. */
  doors: readonly DungeonDoor[];
  /** Per faction, the nearest flight path to the zone's first door (or the area); a faction with none on this continent is left out. */
  flightPaths: readonly DungeonFlightPath[];
}
