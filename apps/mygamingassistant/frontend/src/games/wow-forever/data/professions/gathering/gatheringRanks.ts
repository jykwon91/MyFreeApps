import { CONFIDENCE_BASIS } from "@/games/wow-forever/types/confidenceBasis";
import type { GatheringRank } from "@/games/wow-forever/types/gathering/gatheringRank";

/**
 * The gathering ranks. Caps and train-at skills are Classic Era's; the
 * character levels (10 / 20 / 35) are the Classic rule, unconfirmed for Forever.
 */
export const GATHERING_RANKS: readonly GatheringRank[] = [
  { name: "Apprentice", trainAt: 1, cap: 75, level: null, confidence: "unconfirmed", basis: CONFIDENCE_BASIS.classic },
  { name: "Journeyman", trainAt: 50, cap: 150, level: 10, confidence: "unconfirmed", basis: CONFIDENCE_BASIS.classic },
  { name: "Expert", trainAt: 125, cap: 225, level: 20, confidence: "unconfirmed", basis: CONFIDENCE_BASIS.classic },
  { name: "Artisan", trainAt: 200, cap: 300, level: 35, confidence: "unconfirmed", basis: CONFIDENCE_BASIS.classic },
];
