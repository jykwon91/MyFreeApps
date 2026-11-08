import type { Rare } from "@/games/wow-forever/types/rares/rare";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";

/** A rare that fits the level, with the spot its card row shows. */
export interface AskRankedRare {
  rare: Rare;
  spawn: RareSpawn;
  /** It spawns in the zone the player is in or named. */
  inZone: boolean;
}
