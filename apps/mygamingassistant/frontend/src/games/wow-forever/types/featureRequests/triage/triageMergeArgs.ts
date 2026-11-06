import type { TriageStoryVersion } from "@/games/wow-forever/types/featureRequests/triage/triageStoryVersion";

export interface TriageMergeArgs {
  story: TriageStoryVersion;
  intoStoryId: string;
}
