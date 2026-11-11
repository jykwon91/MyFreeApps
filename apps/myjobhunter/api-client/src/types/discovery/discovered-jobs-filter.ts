import type { DiscoverView } from "./discover-view";

/** Which discovered postings a paged list shows: a view, and optionally one saved search's. */
export interface DiscoveredJobsFilter {
  state: DiscoverView;
  source_id?: string;
}
