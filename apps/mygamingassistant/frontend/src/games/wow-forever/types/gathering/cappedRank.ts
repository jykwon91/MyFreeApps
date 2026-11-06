import type { GatheringRank } from "@/games/wow-forever/types/gathering/gatheringRank";

/** Your skill is at a rank's cap: the rank you hold and the one to train next. */
export interface CappedRank {
  current: GatheringRank;
  next: GatheringRank;
}
