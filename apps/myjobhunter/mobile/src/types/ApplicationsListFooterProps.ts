export interface ApplicationsListFooterProps {
  /** The next page is on its way. */
  isLoadingMore: boolean;
  /** The next page failed to load; the rows above stay. */
  isLoadMoreError: boolean;
  onRetry: () => void;
}
