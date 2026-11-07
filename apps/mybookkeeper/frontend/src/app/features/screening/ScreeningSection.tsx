import { useState } from "react";
import { useGetScreeningEligibilityQuery, useGetScreeningResultsQuery } from "@mybookkeeper/api-client/store/screeningApi";
import type { ScreeningReport } from "@mybookkeeper/api-client/types/applicant/screening-report";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import ScreeningHistoryBody from "./ScreeningHistoryBody";
import ScreeningInlineRetry from "./ScreeningInlineRetry";
import ScreeningSectionSkeleton from "./ScreeningSectionSkeleton";
import ScreeningStatusPanel from "./ScreeningStatusPanel";
import UploadScreeningResultModal from "./UploadScreeningResultModal";

export interface ScreeningSectionProps {
  applicantId: string;
  canWrite: boolean;
  /** Present once the host has shown sensitive data. */
  reports?: readonly ScreeningReport[];
  /** Override window.open — only used by tests. */
  openWindow?: (url: string) => void;
}

/**
 * The full screening section — orchestrates the eligibility gate, provider
 * grid, pending panel, and results list.
 *
 * Flow:
 *   1. A pending screening → show pending panel (upload CTA for writers), whatever
 *      eligibility says: eligibility only gates starting a new screening.
 *   2. Not eligible → show gate with missing-field list.
 *   3. Eligible + no pending → show provider grid and upload button (writers only —
 *      readers see "no screening initiated yet" placeholder). Opening a provider
 *      doesn't create a pending result, so this is the usual way to reach the upload.
 *   4. After grid action: results list appears below (always visible when results exist).
 *
 * Completed results list below whatever state is shown above (or a retry if they fail to load).
 * This lets the host see historical results while a new one is pending.
 */
export default function ScreeningSection({ applicantId, canWrite, reports, openWindow }: ScreeningSectionProps) {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const {
    data: eligibility,
    error: eligibilityError,
    isFetching: isEligibilityFetching,
    refetch: refetchEligibility,
  } = useGetScreeningEligibilityQuery(applicantId);

  const {
    data: results,
    error: resultsError,
    isFetching: isResultsFetching,
    refetch: refetchResults,
  } = useGetScreeningResultsQuery(applicantId);

  const pendingResult = results?.find((r) => r.status === "pending") ?? null;
  const completedResults = results?.filter((r) => r.status !== "pending") ?? [];
  // Decided on `error`, not `isError`: RTK clears `isError` while Retry
  // refetches, which would flash "No completed screening reports yet".
  const historyMode = resolveListLoadMode({
    hasData: results !== undefined,
    hasError: resultsError !== undefined,
    itemCount: completedResults.length,
  });
  const isFirstLoad =
    (results === undefined && resultsError === undefined) ||
    (eligibility === undefined && eligibilityError === undefined);

  if (isFirstLoad) {
    return <ScreeningSectionSkeleton />;
  }

  return (
    <div data-testid="screening-section-content" className="space-y-4">
      <ScreeningStatusPanel
        applicantId={applicantId}
        canWrite={canWrite}
        pendingResult={pendingResult}
        eligibility={eligibility}
        hasEligibilityError={eligibilityError !== undefined}
        isEligibilityRetrying={isEligibilityFetching}
        onRetryEligibility={() => void refetchEligibility()}
        onUploadClick={() => setUploadModalOpen(true)}
        openWindow={openWindow}
      />

      {resultsError ? (
        <ScreeningInlineRetry
          message="I couldn't load the screening history."
          isRetrying={isResultsFetching}
          onRetry={() => void refetchResults()}
          testId="screening-list-error"
          retryTestId="screening-list-retry"
        />
      ) : null}

      <ScreeningHistoryBody
        mode={historyMode}
        completedResults={completedResults}
        reports={reports}
        showEmptyNote={!pendingResult && eligibility?.eligible === true && canWrite}
      />

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
