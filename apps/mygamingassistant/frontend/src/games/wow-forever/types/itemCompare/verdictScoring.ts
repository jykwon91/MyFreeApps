import type { ItemScorer } from "@/games/wow-forever/types/itemCompare/itemScorer";

/** How the saved character's verdicts are scored, and who for ("Fire Mage"; "Mage" below 60). */
export interface VerdictScoring {
  score: ItemScorer;
  label: string;
  leveling: boolean;
}
