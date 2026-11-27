import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useStartSavingsResearchMutation } from "@mybookkeeper/api-client/store/savingsApi";
import { refusedRequestDetail } from "@mybookkeeper/api-client/utils/refusedRequestDetail";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

export interface SavingsResearchNowButtonProps {
  runInProgress: boolean;
  limitReached: boolean;
}

/**
 * Starts a research run in the background. The answer comes back at once (202); the page then polls
 * until the run finishes. A refusal (already running, daily limit) shows the server's own reason.
 */
export default function SavingsResearchNowButton({ runInProgress, limitReached }: SavingsResearchNowButtonProps) {
  const [start, { isLoading }] = useStartSavingsResearchMutation();

  async function handleClick() {
    try {
      await start().unwrap();
      showSuccess(MSG.researchStarted);
    } catch (err) {
      showError(refusedRequestDetail(err, MSG.researchFailed));
    }
  }

  return (
    <LoadingButton
      type="button"
      isLoading={isLoading || runInProgress}
      loadingText={MSG.researching}
      disabled={limitReached}
      onClick={() => void handleClick()}
      data-testid="savings-research-now"
    >
      {MSG.researchNow}
    </LoadingButton>
  );
}
