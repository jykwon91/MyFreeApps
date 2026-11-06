import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { TriageSort } from "@/games/wow-forever/types/featureRequests/triage/triageSort";
import type { TriageStatusFilter } from "@/games/wow-forever/types/featureRequests/triage/triageStatusFilter";

/** The All requests tab's filters, kept in the URL. */
export interface TriageListFilters {
  status: TriageStatusFilter;
  area: FeatureArea | null;
  sort: TriageSort;
}
