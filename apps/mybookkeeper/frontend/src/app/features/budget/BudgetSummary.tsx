import type { BudgetMonth } from "@mybookkeeper/api-client/types/budget/budget-month";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";
import BudgetProgressBar from "./BudgetProgressBar";

export interface BudgetSummaryProps {
  budget: BudgetMonth;
}

/** The month at a glance: what was budgeted, spent, and what's left. */
export default function BudgetSummary({ budget }: BudgetSummaryProps) {
  const { totals, currency } = budget;
  const money = (cents: number) => formatAccountBalance(cents, currency);
  const left = totals.remaining_cents === null
    ? MSG.noBudgetTotal
    : totals.is_over_budget
      ? MSG.totalOver(money(-totals.remaining_cents))
      : money(totals.remaining_cents);

  return (
    <div className="space-y-3" data-testid="budget-summary">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FinancialAccountTotalTile
          label={MSG.budgeted}
          value={totals.budgeted_cents === null ? MSG.noBudgetTotal : money(totals.budgeted_cents)}
          testId="budget-total-budgeted"
        />
        <FinancialAccountTotalTile label={MSG.spent} value={money(totals.spent_cents)} testId="budget-total-spent" emphasis />
        <FinancialAccountTotalTile label={MSG.left} value={left} testId="budget-total-left" />
      </div>
      {totals.percent_used !== null ? (
        <BudgetProgressBar percent={totals.percent_used} isOver={totals.is_over_budget} label={MSG.progressLabel(MSG.pageTitle)} />
      ) : null}
    </div>
  );
}
