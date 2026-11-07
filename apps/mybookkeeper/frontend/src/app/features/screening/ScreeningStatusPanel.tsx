import { Button } from "@platform/ui";
import type { ScreeningEligibilityResponse } from "@mybookkeeper/api-client/types/applicant/screening-eligibility-response";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";
import ScreeningEligibilityGate from "./ScreeningEligibilityGate";
import ScreeningInlineRetry from "./ScreeningInlineRetry";
import ScreeningPendingPanel from "./ScreeningPendingPanel";
import ScreeningProviderGrid from "./ScreeningProviderGrid";

export interface ScreeningStatusPanelProps {
  applicantId: string;
  canWrite: boolean;
  pendingResult: ScreeningResult | null;
  eligibility: ScreeningEligibilityResponse | undefined;
  /** The latest eligibility check failed. Kept through a Retry, unlike `isError`. */
  hasEligibilityError: boolean;
  isEligibilityRetrying: boolean;
  onRetryEligibility: () => void;
  onUploadClick: () => void;
  openWindow?: (url: string) => void;
}

/** The top of the screening section: what the host can do about screening right now. */
export default function ScreeningStatusPanel({
  applicantId,
  canWrite,
  pendingResult,
  eligibility,
  hasEligibilityError,
  isEligibilityRetrying,
  onRetryEligibility,
  onUploadClick,
  openWindow,
}: ScreeningStatusPanelProps) {
  // A screening already started stays reachable even if the applicant has
  // since lost the contact details needed to start a new one.
  if (pendingResult) {
    return <ScreeningPendingPanel pendingResult={pendingResult} onUploadClick={onUploadClick} canWrite={canWrite} />;
  }
  if (hasEligibilityError) {
    return (
      <ScreeningInlineRetry
        message="I couldn't check screening eligibility."
        isRetrying={isEligibilityRetrying}
        onRetry={onRetryEligibility}
        testId="screening-eligibility-error"
        retryTestId="screening-eligibility-retry"
      />
    );
  }
  if (!eligibility) return null;
  if (!eligibility.eligible) return <ScreeningEligibilityGate eligibility={eligibility} />;
  if (!canWrite) {
    return (
      <p data-testid="screening-no-results-viewer" className="text-xs text-muted-foreground italic">
        No screening has been initiated yet.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ScreeningProviderGrid applicantId={applicantId} openWindow={openWindow} />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Got the report? Upload it here to record the outcome.</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onUploadClick}
          data-testid="screening-upload-button"
        >
          Upload report
        </Button>
      </div>
    </div>
  );
}
