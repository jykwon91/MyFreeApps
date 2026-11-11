/** A paged, server-ordered list as a screen needs it. */
export interface InfinitePagesState<T> {
  /** Every loaded row, in the server's order. During a filter or sort change, the previous list's rows. */
  items: T[];
  /** How many match across every page. */
  total: number;
  /** Nothing has loaded yet. */
  isLoading: boolean;
  /** Some list has loaded, for this argument or an earlier one. */
  hasData: boolean;
  /** A new filter or sort is loading its first page; `items` are the old list's. */
  isFiltering: boolean;
  /** The current list couldn't load at all. Undefined once it has loaded. */
  loadError: unknown;
  /** The latest request's error, including a failed refresh of a list already shown. */
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Loading the next page failed; the rows already loaded stay. */
  isLoadMoreError: boolean;
}
