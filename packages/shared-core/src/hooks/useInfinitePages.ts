import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
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
  // Bumped each time a queued load-more is released, which is what makes the effect below fetch.
  const [releases, setReleases] = useState(0);
  const argsKey = JSON.stringify(query.originalArgs ?? null);
  const isLoadMoreQueued = queuedFor === argsKey;
  const { isFetching, hasNextPage, fetchNextPage } = query;

  // Adjusting state during render rather than in an effect: a queued load-more is dropped when the
  // argument changed, and released (fetched, if there still is a next page) once the request settles.
  if (queuedFor !== null && (!isLoadMoreQueued || !isFetching)) {
    setQueuedFor(null);
    if (isLoadMoreQueued && hasNextPage) setReleases(releases + 1);
  }

  const fetchReleasedPage = useEffectEvent(() => {
    void fetchNextPage();
  });

  // Effects can re-run without `releases` changing (Activity hide/show, Fast Refresh, StrictMode), so each release fetches once.
  const firedReleases = useRef(0);
  useEffect(() => {
    if (releases <= firedReleases.current) return;
    firedReleases.current = releases;
    fetchReleasedPage();
  }, [releases]);

  function loadMore(): void {
    // A page already on its way is the page this call asks for, so a repeat call must not load a second one.
    if (query.isFetchingNextPage) return;
    // One request at a time: behind a first page or a refetch, it waits its turn.
    if (isFetching) {
      setQueuedFor(argsKey);
      return;
    }
    void fetchNextPage();
  }

  const state = describeInfinitePages(query, items);
  return { ...state, isFetchingNextPage: state.isFetchingNextPage || isLoadMoreQueued, loadMore, refetch: query.refetch };
}
