import type { RefinedStory } from "@/games/wow-forever/types/featureRequests/refinedStory";

export interface NewVerdictResponse {
  verdict: "new";
  submission_id: string;
  story: RefinedStory;
}
