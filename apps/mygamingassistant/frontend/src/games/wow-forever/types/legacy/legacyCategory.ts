import type { LegacyChallengeGroup } from "@/games/wow-forever/types/legacy/legacyChallengeGroup";

/** A top-level achievement category of Legacy challenges. */
export interface LegacyCategory {
  name: string;
  groups: readonly LegacyChallengeGroup[];
}
