import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

/** A merge target with how alike it is to the story being merged (0–1, area boost included). */
export interface MergeCandidate {
  story: TriageStory;
  score: number;
}
