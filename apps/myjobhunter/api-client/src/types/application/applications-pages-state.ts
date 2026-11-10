import type { Application } from "../application";

/** A paged, server-sorted applications list, as a screen needs it. */
export interface ApplicationsPagesState {
  /** Every loaded row, in the server's order. During a sort change, the previous sort's rows. */
  applications: Application[];
  /** How many match across every page. */
  total: number;
  /** Nothing has loaded yet. */
  isLoading: boolean;
  /** A new sort or filter is loading its first page; `applications` are the old list's. */
  isSorting: boolean;
  /** The current list couldn't load at all. Undefined once it has loaded. */
  loadError: unknown;
  /** The latest request's error, including a failed refresh of a list already shown. */
  error: unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /** Loading the next page failed; the rows already loaded stay. */
  isLoadMoreError: boolean;
  loadMore: () => void;
  /** Reload every loaded page. */
  refetch: () => Promise<unknown>;
}
