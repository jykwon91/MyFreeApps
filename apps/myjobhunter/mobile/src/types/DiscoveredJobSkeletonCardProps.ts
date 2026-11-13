import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

export interface DiscoveredJobSkeletonCardProps {
  /** The Dismissed view's card ends in a dismissal line and one row of Open + Restore. */
  view: DiscoverView;
}
