import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import type { PagedListStatus } from "@/shared/types/paged-list-status";

export interface ListPagesErrorAlertProps {
  pages: PagedListStatus;
  /** What the list holds, plural ("applicants"). */
  noun: string;
}

/**
 * A paged list's load error with Retry. When only "Load more" failed it says so, since the rows above
 * are still good, and Retry asks for that page again; otherwise Retry reloads the list.
 */
export default function ListPagesErrorAlert({ pages, noun }: ListPagesErrorAlertProps) {
  if (pages.error === undefined) return null;
  // `isLoadMoreError` goes false while its retry is in flight; the message holds until that settles.
  const loadMoreFailed = pages.isLoadMoreError || pages.isFetchingNextPage;
  const message = loadMoreFailed
    ? `I couldn't load more ${noun}. Want me to try again?`
    : `I couldn't load your ${noun}. Want me to try again?`;
  return (
    <LoadErrorAlert
      message={message}
      isRetrying={pages.isFetching}
      onRetry={() => (loadMoreFailed ? pages.loadMore() : void pages.refetch())}
    />
  );
}
