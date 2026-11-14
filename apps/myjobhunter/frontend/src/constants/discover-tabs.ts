import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

/** Accessible name of the Discover view tablist. */
export const DISCOVER_TABLIST_LABEL = "Discovery views";

/** The one tabpanel element; it shows whichever view is active, so every tab controls it. */
export const DISCOVER_TABPANEL_ID = "discover-tabpanel";

/** The id of a view's tab, which the tabpanel names itself by while that view is active. */
export function discoverTabId(view: DiscoverView): string {
  return `discover-tab-${view}`;
}
