import { useMemo, useState } from "react";
import { useListLeaseTemplatePagesInfiniteQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import { uniqueById } from "@/shared/utils/unique-by-id";

/** The org's lease templates a page at a time, for the screens that choose among them. */
export function useLeaseTemplatePages() {
  const { data, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } =
    useListLeaseTemplatePagesInfiniteQuery();
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const templates = useMemo(() => uniqueById(data?.pages.flatMap((page) => page.items) ?? []), [data]);

  async function loadMore(): Promise<void> {
    setLoadMoreFailed((await fetchNextPage()).isError);
  }

  async function reload(): Promise<void> {
    setLoadMoreFailed(false);
    await refetch();
  }

  return {
    templates,
    hasData: data !== undefined,
    // A failed "Load more" is reported by the footer, not as the list failing to load.
    loadError: loadMoreFailed ? undefined : error,
    isFetching,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    loadMoreFailed,
    loadMore,
    reload,
  };
}
