import type { DiscoverView } from "../types/discovery/discover-view";
import type { DiscoveredJobsFilter } from "../types/discovery/discovered-jobs-filter";

/** The paged-list filter for a view, narrowed to one saved search when one is chosen. */
export function discoveredJobsFilter(state: DiscoverView, sourceId: string | null): DiscoveredJobsFilter {
  return sourceId ? { state, source_id: sourceId } : { state };
}
