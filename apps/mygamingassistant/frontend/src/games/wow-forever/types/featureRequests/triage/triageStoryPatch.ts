import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";
import type { TriageSettableStatus } from "@/games/wow-forever/types/featureRequests/triage/triageSettableStatus";

/** `PATCH /stories/{id}` body: only the fields that changed (the server forbids unknown keys). */
export interface TriageStoryPatch {
  title?: string;
  persona?: string;
  i_want?: string;
  so_that?: string;
  acceptance_criteria?: string[];
  follow_ups?: string[];
  area?: FeatureArea;
  topic?: string | null;
  feasibility?: FeatureFeasibility;
  feasibility_note?: string | null;
  status?: TriageSettableStatus;
  priority?: number | null;
  operator_note?: string | null;
  shipped_path?: string | null;
  hidden?: boolean;
}
