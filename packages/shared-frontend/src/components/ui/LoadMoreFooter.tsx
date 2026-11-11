import type { LoadMoreFooterProps } from "../../types/load-more-footer-props";
import LoadingButton from "./LoadingButton";

/** Under a paged list: how many are showing, and a button for the next page. Nothing once every row is loaded. */
export default function LoadMoreFooter({
  shown,
  total,
  hasNextPage,
  isLoading,
  isError,
  onLoadMore,
  messages,
}: LoadMoreFooterProps) {
  if (!hasNextPage) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {messages.showingCount(shown, total)}
      </p>
      {isError && !isLoading ? (
        <p role="alert" className="text-sm text-destructive">
          {messages.couldntLoadMore}
        </p>
      ) : null}
      <LoadingButton
        variant="secondary"
        isLoading={isLoading}
        loadingText={messages.loadingMore}
        onClick={onLoadMore}
        className="min-h-[44px]"
      >
        {isError ? messages.tryAgain : messages.loadMore}
      </LoadingButton>
    </div>
  );
}
