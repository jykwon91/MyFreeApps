import type { Confidence } from "@/games/wow-forever/data/professions/professionTypes";
import type { ConfidenceBasis } from "@/games/wow-forever/types/confidenceBasis";

/** A profession rank: trained from `trainAt` skill, it lets your skill go up to `cap`. */
export interface GatheringRank {
  name: string;
  trainAt: number;
  cap: number;
  /** The character level it asks; null for the first rank. */
  level: number | null;
  confidence: Confidence;
  basis?: ConfidenceBasis;
}
