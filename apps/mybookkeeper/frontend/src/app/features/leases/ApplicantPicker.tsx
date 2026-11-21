import { LoadingButton, Skeleton } from "@platform/ui";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import { useLeaseApplicantPages } from "./useLeaseApplicantPages";

export interface ApplicantPickerProps {
  selectedId: string | null;
  onSelect: (applicant: ApplicantSummary) => void;
}

/**
 * Renders a pick-list of applicants eligible for lease generation: ``approved`` and
 * ``lease_sent`` stages, fetched by stage from the server and paged with "Load more".
 */
export default function ApplicantPicker({ selectedId, onSelect }: ApplicantPickerProps) {
  const pages = useLeaseApplicantPages();
  const { applicants, hasNextPage, isFetching, isFetchingNextPage, loadMoreFailed, loadMore, retry } = pages;

  const mode = resolveListLoadMode({
    hasData: pages.hasData,
    hasError: pages.hasError,
    itemCount: applicants.length,
  });

  // Decided on `hasError`, not `isError`: RTK clears `isError` while Retry
  // refetches, which would flash "No applicants at the right stage" mid-retry.
  const loadError = pages.hasError ? (
    <LoadErrorAlert
      message={
        loadMoreFailed
          ? "I couldn't load more applicants. Want me to try again?"
          : "I couldn't load your applicants. Want me to try again?"
      }
      isRetrying={isFetching}
      onRetry={retry}
    />
  ) : null;

  switch (mode) {
    case "error":
      return loadError;
    case "loading":
      return (
        <div className="space-y-2" data-testid="applicant-picker-skeleton">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    case "empty":
      return (
        <p className="text-sm text-muted-foreground py-4 text-center" data-testid="applicant-picker-empty">
          No applicants at the right stage yet — move one to{" "}
          <span className="font-medium">Approved</span> or{" "}
          <span className="font-medium">Lease Sent</span> first.
        </p>
      );
    case "list":
      return (
        <div className="space-y-3">
          {/* Items from an earlier load stay usable; this says the latest one failed. */}
          {loadError}
          <ul className="space-y-2" data-testid="applicant-picker-list">
            {applicants.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a)}
                  className={[
                    "w-full text-left border rounded-lg px-4 py-3 transition-colors min-h-[44px]",
                    selectedId === a.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50",
                  ].join(" ")}
                  data-testid={`applicant-option-${a.id}`}
                >
                  <span className="font-medium text-sm">
                    {a.legal_name ?? "Unnamed applicant"}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {a.stage.replace(/_/g, " ")}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          {hasNextPage ? (
            <div className="flex justify-center">
              <LoadingButton
                variant="secondary"
                onClick={loadMore}
                isLoading={isFetchingNextPage}
                loadingText="Loading..."
                data-testid="applicant-picker-load-more"
              >
                Load more
              </LoadingButton>
            </div>
          ) : null}
        </div>
      );
  }
}
