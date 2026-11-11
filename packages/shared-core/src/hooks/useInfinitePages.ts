import { useMemo } from "react";
import type { InfinitePagesQuery } from "../types/paging/infinite-pages-query";
import type { InfinitePagesResult } from "../types/paging/infinite-pages-result";
import type { PageOfItems } from "../types/paging/page-of-items";
import { describeInfinitePages } from "../utils/describeInfinitePages";
import { flattenPagesById } from "../utils/flattenPagesById";

/** A paged list from an RTK Query infinite-query result, with `loadMore` that never overlaps another request. */
export function useInfinitePages<T extends { id: string }>(query: InfinitePagesQuery<PageOfItems<T>>): InfinitePagesResult<T> {
  const pages = (query.currentData ?? query.data)?.pages;
  const items = useMemo(() => flattenPagesById(pages), [pages]);

  function loadMore(): void {
    // One request at a time: never on top of a first page, a refetch or another page.
    if (query.isFetching) return;
    void query.fetchNextPage();
  }

  return { ...describeInfinitePages(query, items), loadMore, refetch: query.refetch };
}
