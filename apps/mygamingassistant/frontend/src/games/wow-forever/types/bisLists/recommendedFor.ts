import type { BisListPhase } from "@/games/wow-forever/data/bisLists/bisListPhases";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Who a new list's recommended picks are for. */
export interface RecommendedFor {
  classId: WowClassId;
  specId: string;
  phase: BisListPhase;
  /** Leveling lists only: the level the picks are for. */
  level: number;
  faction: PlayerFaction;
}
