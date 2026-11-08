import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The flight master a faction can use nearest a dungeon's door (its own or a neutral one). */
export interface DungeonFlightPath {
  faction: PlayerFaction;
  /** The client's flight-path name: "Sentinel Hill, Westfall". */
  name: string;
  /** Straight-line yards from the door. */
  yards: number;
}
