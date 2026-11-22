import type { DiscoverEmptyCopy } from "./discover-empty-copy";

/** One Discover view's empty states: with every saved search showing, and with one chosen. */
export interface DiscoverViewEmptyCopy {
  empty: DiscoverEmptyCopy;
  emptyFiltered: DiscoverEmptyCopy;
}
