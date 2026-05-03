import { useState } from "react";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetScreeningEligibilityQuery, useGetScreeningResultsQuery } from "@/shared/store/screeningApi";
import ScreeningEligibilityGate from "./ScreeningEligibilityGate";
import ScreeningPendingPanel from "./ScreeningPendingPanel";
import ScreeningProviderGrid from "./ScreeningProviderGrid";
import ScreeningResultCard from "./ScreeningResultCard";
import UploadScreeningResultModal from "./UploadScreeningResultModal";

interface Props {
  applicantId: string;
  canWrite: boolean;
  /** Override window.open — only used by tests. */
  openWindow?: (url: string) => void;
}

function ScreeningSectionSkeleton() {
  return (
    <div
      data-testid="screening-section-skeleton"
      className="space-y-3"
      aria-hidden="true"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-8 w-28 rounded self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The full screening section — orchestrates the eligibility gate, provider
 * grid, pending panel, and results list.
 *
 * Flow:
 *   1. Fetch eligibility — not eligible → show gate with missing-field list.
 *   2. Eligible + has_pending → show pending panel (with upload CTA for writers).
 *   3. Eligible + no pending → show provider grid (writers only — readers see
 *      "no screening initiated yet" placeholder).
 *   4. After grid action: results list appears below (always visible when results exist).
 *
 * Results list is always shown when results exist, regardless of current state.
 * This lets the host see historical results while a new one is pending.
 */
export default function ScreeningSection({ applicantId, canWrite, openWindow }: Props) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const {
    data: eligibility,
    isLoading: isEligibilityLoading,
    isError: isEligibilityError,
  } = useGetScreeningEligibilityQuery(applicantId);

  const {
    data: results,
    isLoading: isResultsLoading,
    isError: isResultsError,
    refetch: refetchResults,
    isFetching: isResultsFetching,
  } = useGetScreeningResultsQuery(applicantId);

  const pendingResult = results?.find((r) => r.status === "pending") ?? null;
  const completedResults = results?.filter((r) => r.status !== "pending") ?? [];

  if (isEligibilityLoading || isResultsLoading) {
    return <ScreeningSectionSkeleton />;
  }

  return (
    <div
      data-testid="screening-section-content"
      className="space-y-4"
    >
      {/* Eligibility error — degraded gracefully */}
      {isEligibilityError ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid="screening-eligibility-error"
        >
          I couldn't check screening eligibility. Please refresh the page.
        </p>
      ) : eligibility && !eligibility.eligible ? (
        /* Not eligible — show gate */
        <ScreeningEligibilityGate eligibility={eligibility} />
      ) : eligibility?.eligible ? (
        /* Eligible — show pending panel or provider grid */
        pendingResult ? (
          <ScreeningPendingPanel
            pendingResult={pendingResult}
            onUploadClick={() => setUploadModalOpen(true)}
            canWrite={canWrite}
          />
        ) : canWrite ? (
          <ScreeningProviderGrid
            applicantId={applicantId}
            openWindow={openWindow}
          />
        ) : (
          <p
            data-testid="screening-no-results-viewer"
            className="text-xs text-muted-foreground italic"
          >
            No screening has been initiated yet.
          </p>
        )
      ) : null}

      {/* Results list — always shown when completed results exist */}
      {isResultsError ? (
        <div className="text-xs text-muted-foreground italic flex items-center gap-3">
          <span>I couldn't load the screening history.</span>
          <button
            type="button"
            onClick={() => refetchResults()}
            disabled={isResultsFetching}
            className="text-primary hover:underline min-h-[44px]"
            data-testid="screening-list-retry"
          >
            {isResultsFetching ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : completedResults.length > 0 ? (
        <div
          data-testid="screening-results-list"
          className="space-y-3"
        >
          {completedResults.map((result) => (
            <ScreeningResultCard key={result.id} result={result} />
          ))}
        </div>
      ) : !pendingResult && eligibility?.eligible && !canWrite ? null : (
        completedResults.length === 0 && !pendingResult && eligibility?.eligible ? (
          <p
            data-testid="screening-results-empty"
            className="text-xs text-muted-foreground italic"
          >
            No completed screening reports yet.
          </p>
        ) : null
      )}

      {/* Upload modal — writers only */}
      {canWrite ? (
        <UploadScreeningResultModal
          applicantId={applicantId}
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
