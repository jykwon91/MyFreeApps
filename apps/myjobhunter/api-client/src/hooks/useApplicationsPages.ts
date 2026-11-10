import { useMemo } from "react";
import { useListApplicationsInfiniteQuery } from "../store/applicationsApi";
import type { ApplicationsListQuery } from "../types/application/applications-list-query";
import type { ApplicationsPagesState } from "../types/application/applications-pages-state";
import { flattenApplicationPages } from "../utils/flattenApplicationPages";
import { getApplicationsTotal } from "../utils/getApplicationsTotal";

/**
 * GET /applications a page at a time, sorted on the server so the order holds
 * across pages. Shared by the web table and the phone list. `skip` waits for
 * an id the filter needs.
 */
export function useApplicationsPages(arg: ApplicationsListQuery, skip = false): ApplicationsPagesState {
  const query = useListApplicationsInfiniteQuery(arg, { skip });
  const pages = query.data?.pages;
  const applications = useMemo(() => flattenApplicationPages(pages), [pages]);
  const hasCurrent = query.currentData !== undefined;
  // RTK's own isFetchNextPageError, which the hook's type leaves out: the last
  // fetch failed and it was a next page. Any later fetch that succeeds (Try
  // again, a refetch, an invalidation) clears it, and each sort has its own.
  const isLoadMoreError = query.isError && query.direction === "forward";

  function loadMore(): void {
    // One request at a time: never on top of a first page, a refetch or another page.
    if (query.isFetching) return;
    void query.fetchNextPage();
  }

  return {
    applications,
    total: getApplicationsTotal(pages),
    isLoading: query.isLoading,
    isSorting: query.isFetching && !hasCurrent && query.data !== undefined,
    loadError: query.isError && !hasCurrent ? query.error : undefined,
    error: query.error,
    hasNextPage: hasCurrent && query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoadMoreError,
    loadMore,
    refetch: query.refetch,
  };
}
