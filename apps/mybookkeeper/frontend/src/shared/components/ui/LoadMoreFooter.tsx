import { LoadingButton } from "@platform/ui";
import LoadErrorAlert from "./LoadErrorAlert";

export interface LoadMoreFooterProps {
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  failureMessage: string;
  onLoadMore: () => void;
}

/** Under a paged list: a Load more button, or what went wrong with the last one and a Retry. */
export default function LoadMoreFooter({ hasMore, isLoadingMore, loadMoreFailed, failureMessage, onLoadMore }: LoadMoreFooterProps) {
  if (loadMoreFailed) {
    return <LoadErrorAlert message={failureMessage} isRetrying={isLoadingMore} onRetry={onLoadMore} />;
  }
  if (!hasMore) return null;
  return (
    <div className="flex justify-center">
      <LoadingButton
        type="button"
        variant="secondary"
        isLoading={isLoadingMore}
        loadingText="Loading..."
        onClick={onLoadMore}
        data-testid="load-more-button"
      >
        Load more
      </LoadingButton>
    </div>
  );
}
