/** What one Discover view says when it couldn't load, or has nothing to show. */
export interface DiscoverViewCopy {
  couldntLoad: string;
  emptyHeading: string;
  emptyBody: string;
  /** Said instead when a saved search is chosen. */
  emptyFilteredHeading: string;
  emptyFilteredBody: string;
}
