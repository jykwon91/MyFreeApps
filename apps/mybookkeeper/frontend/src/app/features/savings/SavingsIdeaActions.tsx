import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { useSetSavingsIdeaStatusMutation } from "@mybookkeeper/api-client/store/savingsApi";
import type { SavingsIdeaStatus } from "@mybookkeeper/api-client/types/savings/savings-idea-status";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

export interface SavingsIdeaActionsProps {
  ideaId: string;
}

/** Done and Dismiss. Either takes the idea off the list, and a later run won't bring it back. */
export default function SavingsIdeaActions({ ideaId }: SavingsIdeaActionsProps) {
  const [setStatus, { isLoading, originalArgs }] = useSetSavingsIdeaStatusMutation();
  const pending = isLoading ? originalArgs?.status : undefined;

  async function mark(status: SavingsIdeaStatus) {
    try {
      await setStatus({ id: ideaId, status }).unwrap();
      showSuccess(status === "done" ? MSG.markedDone : MSG.dismissed);
    } catch {
      showError(MSG.statusFailed);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <LoadingButton
        type="button"
        size="sm"
        isLoading={pending === "done"}
        loadingText={MSG.markingDone}
        disabled={isLoading}
        onClick={() => void mark("done")}
        data-testid="savings-idea-done"
      >
        {MSG.markDone}
      </LoadingButton>
      <LoadingButton
        type="button"
        size="sm"
        variant="secondary"
        isLoading={pending === "dismissed"}
        loadingText={MSG.dismissing}
        disabled={isLoading}
        onClick={() => void mark("dismissed")}
        data-testid="savings-idea-dismiss"
      >
        {MSG.dismiss}
      </LoadingButton>
    </div>
  );
}
