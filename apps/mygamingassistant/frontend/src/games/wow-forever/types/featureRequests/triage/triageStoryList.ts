import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

/** `GET /wow/feature-requests/triage/stories` — every story, no server paging. */
export interface TriageStoryList {
  items: TriageStory[];
}
