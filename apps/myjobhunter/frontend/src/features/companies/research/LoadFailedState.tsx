import { LoadingButton } from "@platform/ui";
import { COMPANY_RESEARCH_MESSAGES } from "@/constants/company-research-messages";

interface LoadFailedStateProps {
  onRetry: () => void;
  isRetrying: boolean;
}

/** The research couldn't be read. Trying again reads it again; it never starts a run. */
export default function LoadFailedState({ onRetry, isRetrying }: LoadFailedStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-destructive">{COMPANY_RESEARCH_MESSAGES.couldntLoad}</p>
      <LoadingButton isLoading={isRetrying} onClick={onRetry}>
        {COMPANY_RESEARCH_MESSAGES.tryAgain}
      </LoadingButton>
    </div>
  );
}
