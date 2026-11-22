export interface ApplicationsListFooterProps {
  /** The next page is on its way. */
  isLoadingMore: boolean;
  /** The next page failed to load; the rows above stay. */
  isLoadMoreError: boolean;
  /** Rows showing now. */
  shown: number;
  /** How many match across every page; undefined until the list has loaded. */
  total: number | undefined;
  onRetry: () => void;
}
