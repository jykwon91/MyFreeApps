import { useListLeaseTemplatePagesInfiniteQuery } from "@mybookkeeper/api-client/store/leaseTemplatesApi";
import type { LeaseTemplateSummary } from "@mybookkeeper/api-client/types/lease/lease-template-summary";
import { useMemo } from "react";
import { uniqueById } from "../../lib/uniqueById";
import { useLoadMoreFailure } from "../shell/useLoadMoreFailure";

/** The host's lease templates a page at a time, for the pickers that choose among them. */
export function useLeaseTemplatePages() {
  const { currentData, error, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch } = useListLeaseTemplatePagesInfiniteQuery();
  const { loadMoreFailed, loadMore, clearLoadMoreFailure } = useLoadMoreFailure(async () => (await fetchNextPage()).isError);
  const rows: LeaseTemplateSummary[] = useMemo(() => uniqueById(currentData?.pages.flatMap((page) => page.items) ?? []), [currentData]);

  return {
    isLoaded: currentData !== undefined,
    rows,
    error,
    isFetching,
    isFetchingNextPage,
    loadMoreFailed,
    loadMore,
    reload: async () => {
      clearLoadMoreFailure();
      await refetch();
    },
    loadMoreIfAny: () => {
      if (hasNextPage && !isFetchingNextPage && !loadMoreFailed) void loadMore();
    },
  };
}
