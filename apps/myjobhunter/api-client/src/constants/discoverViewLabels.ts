import type { DiscoverView } from "../types/discovery/discover-view";

/** Each Discover view's tab label, the same on the website and the phone. */
export const DISCOVER_VIEW_LABELS: Readonly<Record<DiscoverView, string>> = {
  inbox: "Inbox",
  saved: "Saved",
  dismissed: "Dismissed",
};

/** The views in the order their tabs appear. */
export const DISCOVER_VIEWS: readonly DiscoverView[] = ["inbox", "saved", "dismissed"];
