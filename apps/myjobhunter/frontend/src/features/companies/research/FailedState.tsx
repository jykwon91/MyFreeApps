import { LoadingButton } from "@platform/ui";
import { COMPANY_RESEARCH_MESSAGES } from "@/constants/company-research-messages";

interface FailedStateProps {
  errorMessage: string | null;
  onRunResearch: () => void;
  isRunning: boolean;
  /** False when retrying can't work, as when research isn't set up on the server. */
  canRetry: boolean;
}

export default function FailedState({ errorMessage, onRunResearch, isRunning, canRetry }: FailedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {canRetry ? null : <p className="text-sm font-medium">{COMPANY_RESEARCH_MESSAGES.notConfigured}</p>}
      <p className="text-sm text-destructive">
        {errorMessage ?? "Research failed. Please try again."}
      </p>
      {canRetry ? (
        <LoadingButton isLoading={isRunning} onClick={onRunResearch}>
          Retry
        </LoadingButton>
      ) : null}
    </div>
  );
}
