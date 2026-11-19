import { Skeleton } from "@platform/mobile";
import type { PagedListPages } from "../../types/PagedListPages";
import PagedListFooter from "./PagedListFooter";

interface PagedChoicesFooterProps {
  choices: PagedListPages;
  /** What's loading, for screen readers ("Loading more listings"). */
  loadingLabel: string;
}

/** Under a picker's choices: a skeleton row while the next page loads, or a retry when it failed. */
export default function PagedChoicesFooter({ choices, loadingLabel }: PagedChoicesFooterProps) {
  return (
    <PagedListFooter
      isLoadingMore={choices.isFetchingNextPage}
      loadMoreFailed={choices.isLoadMoreError}
      loadingLabel={loadingLabel}
      onRetry={choices.loadMore}
      skeletonRow={<Skeleton height={56} />}
    />
  );
}
