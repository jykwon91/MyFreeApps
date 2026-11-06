import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";

/** The refined user story — what both the submit result and the board card show. */
export interface StoryText {
  id: string;
  title: string;
  persona: string;
  i_want: string;
  so_that: string;
  acceptance_criteria: string[];
  follow_ups: string[];
  area: FeatureArea;
  topic: string | null;
  feasibility: FeatureFeasibility;
  feasibility_note: string | null;
}
