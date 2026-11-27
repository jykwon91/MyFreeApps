import type { SavingsOverview } from "@mybookkeeper/api-client/types/savings/savings-overview";
import { formatSavingsRange, formatSavingsTime } from "@mybookkeeper/api-client/utils/savingsFormat";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import { SAVINGS_MESSAGES as MSG } from "@/shared/lib/savings-messages";
import SavingsResearchNowButton from "./SavingsResearchNowButton";
import SavingsResearchToggle from "./SavingsResearchToggle";

export interface SavingsHeaderProps {
  overview: SavingsOverview;
}

function nextResearchText(overview: SavingsOverview): string {
  if (overview.run_in_progress) return MSG.whileRunning;
  if (overview.next_research_due_at === null) return MSG.never;
  return formatSavingsTime(overview.next_research_due_at);
}

function runsLeftText(overview: SavingsOverview): string {
  if (overview.manual_runs_left === 0 && overview.next_manual_run_at !== null) {
    return MSG.limitReached(formatSavingsTime(overview.next_manual_run_at));
  }
  return MSG.runsLeft(overview.manual_runs_left, overview.manual_run_limit);
}

/** The total the open ideas add up to, when research last ran and runs next, and "Research now". */
export default function SavingsHeader({ overview }: SavingsHeaderProps) {
  const limitReached = overview.manual_runs_left === 0;
  const lastResearched = overview.last_researched_at === null ? MSG.never : formatSavingsTime(overview.last_researched_at);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinancialAccountTotalTile
          label={MSG.totalLabel}
          value={formatSavingsRange(overview.total_savings_low_cents, overview.total_savings_high_cents)}
          testId="savings-total"
          emphasis
        />
        <FinancialAccountTotalTile label={MSG.lastResearched} value={lastResearched} testId="savings-last-researched" />
        <FinancialAccountTotalTile label={MSG.nextResearch} value={nextResearchText(overview)} testId="savings-next-research" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SavingsResearchNowButton runInProgress={overview.run_in_progress} limitReached={limitReached} />
        <p className="text-xs text-muted-foreground" data-testid="savings-runs-left">
          {runsLeftText(overview)}
        </p>
        <div className="sm:ml-auto">
          <SavingsResearchToggle turnOn={false} />
        </div>
      </div>
    </div>
  );
}
