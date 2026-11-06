import type { TriageStoryPatch } from "@/games/wow-forever/types/featureRequests/triage/triageStoryPatch";
import type { TriageStoryVersion } from "@/games/wow-forever/types/featureRequests/triage/triageStoryVersion";

export interface TriagePatchArgs {
  story: TriageStoryVersion;
  patch: TriageStoryPatch;
}
