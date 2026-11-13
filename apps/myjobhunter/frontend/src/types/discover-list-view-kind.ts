import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

/** The Discover tabs that are a plain paged list of cards: every view but the inbox, which also polls scores. */
export type DiscoverListViewKind = Exclude<DiscoverView, "inbox">;
