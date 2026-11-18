import { LoadingButton } from "@platform/ui";
import LoadErrorAlert from "./LoadErrorAlert";

export interface LoadMoreFooterProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isLoadMoreError: boolean;
  failureMessage: string;
  onLoadMore: () => void;
}

/** Under a paged list: a Load more button, or what went wrong with the last one and a Retry. */
export default function LoadMoreFooter({ hasNextPage, isFetchingNextPage, isLoadMoreError, failureMessage, onLoadMore }: LoadMoreFooterProps) {
  if (isLoadMoreError && !isFetchingNextPage) {
    return <LoadErrorAlert message={failureMessage} isRetrying={false} onRetry={onLoadMore} />;
  }
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center">
      <LoadingButton
        type="button"
        variant="secondary"
        isLoading={isFetchingNextPage}
        loadingText="Loading..."
        onClick={onLoadMore}
        data-testid="load-more-button"
      >
        Load more
      </LoadingButton>
    </div>
  );
}
