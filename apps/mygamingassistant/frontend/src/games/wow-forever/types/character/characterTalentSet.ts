import type { CharacterTalentTreeSummary } from "@/games/wow-forever/types/character/characterTalentTreeSummary";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";

/** One saved set read against the class's trees. */
export interface CharacterTalentSet {
  build: TalentBuild;
  /** Trees in the class's own order (the "28 / 0 / 0" order). */
  trees: CharacterTalentTreeSummary[];
  /** Picks whose id isn't in MGA's tree file. */
  unknown: number;
}
