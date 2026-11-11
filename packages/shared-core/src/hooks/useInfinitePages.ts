import { useEffect, useMemo, useState } from "react";
import type { InfinitePagesQuery } from "../types/paging/infinite-pages-query";
import type { InfinitePagesResult } from "../types/paging/infinite-pages-result";
import type { PageOfItems } from "../types/paging/page-of-items";
import { describeInfinitePages } from "../utils/describeInfinitePages";
import { flattenPagesById } from "../utils/flattenPagesById";

/**
 * A paged list from an RTK Query infinite-query result, with `loadMore` that never overlaps another request.
 * A `loadMore` made while another request is in flight (a poll, a refetch) is remembered: the list reads as
 * loading the next page right away, and the page is fetched once that request settles, if there still is one.
 * It is dropped, without fetching, if the query's argument (a filter, a sort) changes in the meantime.
 */
export function useInfinitePages<T extends { id: string }>(query: InfinitePagesQuery<PageOfItems<T>>): InfinitePagesResult<T> {
  const pages = (query.currentData ?? query.data)?.pages;
  const items = useMemo(() => flattenPagesById(pages), [pages]);
  // The argument (serialized, so equal arguments match) a load-more is waiting for; null when none is.
  const [queuedFor, setQueuedFor] = useState<string | null>(null);
  const argsKey = JSON.stringify(query.originalArgs ?? null);
  const isLoadMoreQueued = queuedFor === argsKey;
  const { isFetching, hasNextPage, fetchNextPage } = query;

  useEffect(() => {
    if (queuedFor === null) return;
    if (queuedFor !== argsKey) {
      setQueuedFor(null);
      return;
    }
    if (isFetching) return;
    setQueuedFor(null);
    if (hasNextPage) void fetchNextPage();
  }, [queuedFor, argsKey, isFetching, hasNextPage, fetchNextPage]);

  function loadMore(): void {
    // One request at a time: behind a first page, a refetch or another page, it waits its turn.
    if (isFetching) {
      setQueuedFor(argsKey);
      return;
    }
    void fetchNextPage();
  }

  const state = describeInfinitePages(query, items);
  return { ...state, isFetchingNextPage: state.isFetchingNextPage || isLoadMoreQueued, loadMore, refetch: query.refetch };
}
