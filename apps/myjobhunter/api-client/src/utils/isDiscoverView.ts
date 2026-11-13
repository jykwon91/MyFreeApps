import { DISCOVER_VIEWS } from "../constants/discoverViewLabels";
import type { DiscoverView } from "../types/discovery/discover-view";

/** True when `value` names one of the Discover page's views, e.g. a `?view=` URL param. */
export function isDiscoverView(value: string | null): value is DiscoverView {
  return DISCOVER_VIEWS.some((view) => view === value);
}
