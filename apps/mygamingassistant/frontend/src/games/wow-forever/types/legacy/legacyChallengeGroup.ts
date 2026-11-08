import type { LegacyChallenge } from "@/games/wow-forever/types/legacy/legacyChallenge";

/** A sub-category's challenges (name null when the category has no sub-categories). */
export interface LegacyChallengeGroup {
  name: string | null;
  challenges: readonly LegacyChallenge[];
}
