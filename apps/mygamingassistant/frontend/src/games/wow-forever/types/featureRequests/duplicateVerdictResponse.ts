import type { PublicStory } from "@/games/wow-forever/types/featureRequests/publicStory";

export interface DuplicateVerdictResponse {
  verdict: "duplicate";
  story: PublicStory;
  /** What this idea adds to the existing one, when anything. */
  nuance_note: string | null;
  /** Whether this idea counted as a vote (false when this browser had already voted for it). */
  voted: boolean;
}
