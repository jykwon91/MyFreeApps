import { AlertBox } from "@platform/ui";
import type { SavingsRun } from "@mybookkeeper/api-client/types/savings/savings-run";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";

export interface SavingsRunStatusProps {
  runInProgress: boolean;
  latestRun: SavingsRun | null;
}

const NOT_CONFIGURED = "not_configured";

/** A banner while a run is going, or a note when the last one didn't finish. Nothing otherwise. */
export default function SavingsRunStatus({ runInProgress, latestRun }: SavingsRunStatusProps) {
  if (runInProgress) {
    return (
      <AlertBox variant="info" role="status" data-testid="savings-running">
        {MSG.runningBanner}
      </AlertBox>
    );
  }
  if (latestRun?.status !== "failed") return null;
  return (
    <AlertBox variant="warning" data-testid="savings-run-failed">
      {latestRun.error_type === NOT_CONFIGURED ? MSG.notConfigured : MSG.lastRunFailed}
    </AlertBox>
  );
}
