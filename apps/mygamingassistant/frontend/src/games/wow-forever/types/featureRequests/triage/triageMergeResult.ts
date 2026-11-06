import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

/** A merge's result: the merged-away story and the one it now points at. */
export interface TriageMergeResult {
  source: TriageStory;
  target: TriageStory;
}
