import type { LegacyCategory } from "@/games/wow-forever/types/legacy/legacyCategory";
import type { LegacyReward } from "@/games/wow-forever/types/legacy/legacyReward";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

/** The Legacy planner's data, decoded from `data/legacy/legacy.json`. */
export interface LegacyData {
  /** Most points one character can spend (the game files' cap). */
  cap: number;
  pointIcon: number;
  trees: readonly LegacyTree[];
  categories: readonly LegacyCategory[];
  /** Every challenge id, for the checklist. */
  challengeIds: readonly string[];
  rankMax: number;
  rewards: readonly LegacyReward[];
}
