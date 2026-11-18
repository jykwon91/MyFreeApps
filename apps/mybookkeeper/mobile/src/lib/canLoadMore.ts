import type { PagedListStatus } from "../types/PagedListStatus";

/** Whether reaching the end of a list should ask for the next page: there is one, it isn't on its way, and the last try didn't fail. */
export function canLoadMore(status: PagedListStatus): boolean {
  return status.hasNextPage && !status.isFetchingNextPage && !status.isLoadMoreError;
}
