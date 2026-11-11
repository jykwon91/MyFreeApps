/** What an RTK Query infinite-query hook returns that `useInfinitePages` reads. */
export interface InfinitePagesQuery<Page> {
  /** The last pages held for this hook, which for a failed reload may be older than the store's. */
  data?: { pages: readonly Page[] };
  /** The store's pages for the current argument; undefined while a new argument loads or after it failed. */
  currentData?: { pages: readonly Page[] };
  /** The argument this result is for; a queued load-more only applies while it is unchanged. */
  originalArgs?: unknown;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error?: unknown;
  /** Which way the latest fetch went. */
  direction?: "forward" | "backward";
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
  refetch: () => Promise<unknown>;
}
