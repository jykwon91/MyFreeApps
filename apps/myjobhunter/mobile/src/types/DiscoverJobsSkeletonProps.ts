import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

export interface DiscoverJobsSkeletonProps {
  /** The view loading: the Dismissed view's cards end in a dismissal line and Open + Restore. */
  view: DiscoverView;
}
