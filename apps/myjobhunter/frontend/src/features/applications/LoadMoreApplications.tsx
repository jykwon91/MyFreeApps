import { LoadingButton } from "@platform/ui";
import { APPLICATIONS_LIST_MESSAGES as MESSAGES } from "@/constants/applications-list-messages";
import type { LoadMoreApplicationsProps } from "@/types/application/load-more-applications-props";

/** Under a paged applications table: how many are showing, and a button for the next page. */
export default function LoadMoreApplications({
  shown,
  total,
  hasNextPage,
  isLoading,
  isError,
  onLoadMore,
}: LoadMoreApplicationsProps) {
  if (!hasNextPage) return null;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {MESSAGES.showingCount(shown, total)}
      </p>
      {isError && !isLoading ? (
        <p role="alert" className="text-sm text-destructive">
          {MESSAGES.couldntLoadMore}
        </p>
      ) : null}
      <LoadingButton
        variant="secondary"
        isLoading={isLoading}
        loadingText={MESSAGES.loadingMore}
        onClick={onLoadMore}
        className="min-h-[44px]"
      >
        {isError ? MESSAGES.tryAgain : MESSAGES.loadMore}
      </LoadingButton>
    </div>
  );
}
