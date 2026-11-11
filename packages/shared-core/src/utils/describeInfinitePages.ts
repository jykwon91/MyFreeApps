import type { InfinitePagesQuery } from "../types/paging/infinite-pages-query";
import type { InfinitePagesState } from "../types/paging/infinite-pages-state";
import type { PageOfItems } from "../types/paging/page-of-items";
import { getPagesTotal } from "./getPagesTotal";

/**
 * The state of a paged list from an infinite-query result, `items` being its pages flattened. Reads the pages of the
 * current argument (`currentData`) before the last ones held (`data`): after a failed
 * reload `data` goes stale, while `currentData` still carries what was patched into
 * the store, such as a row deleted in the meantime.
 */
export function describeInfinitePages<T extends { id: string }>(
  query: InfinitePagesQuery<PageOfItems<T>>,
  items: T[],
): InfinitePagesState<T> {
  const pages = (query.currentData ?? query.data)?.pages;
  const hasCurrent = query.currentData !== undefined;
  return {
    items,
    total: getPagesTotal(pages),
    isLoading: query.isLoading,
    hasData: query.data !== undefined,
    isFiltering: query.isFetching && !hasCurrent && query.data !== undefined,
    loadError: query.isError && !hasCurrent ? query.error : undefined,
    error: query.error,
    hasNextPage: hasCurrent && query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    // The last fetch failed and it was a next page. Any later fetch that succeeds clears it.
    isLoadMoreError: query.isError && query.direction === "forward",
  };
}
