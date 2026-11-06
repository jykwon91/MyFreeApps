import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";

/** The edit sheet's form. Optional text is "" while empty; it's sent as null. */
export interface TriageEditDraft {
  title: string;
  persona: string;
  i_want: string;
  so_that: string;
  acceptance_criteria: string[];
  follow_ups: string[];
  area: FeatureArea;
  topic: string;
  feasibility: FeatureFeasibility;
  feasibility_note: string;
  priority: number | null;
  operator_note: string;
}
