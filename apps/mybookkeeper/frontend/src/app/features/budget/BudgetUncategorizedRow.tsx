import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

export interface BudgetUncategorizedRowProps {
  cents: number;
  currency: string;
}

/**
 * Personal spending with no category, counted in the month's total. It has no
 * link: the transactions page has no "uncategorized personal" filter to land on.
 */
export default function BudgetUncategorizedRow({ cents, currency }: BudgetUncategorizedRowProps) {
  return (
    <li className="border border-dashed rounded-lg px-4 py-3 text-sm" data-testid="budget-uncategorized">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{MSG.uncategorized}</p>
        <p className="font-semibold tabular-nums shrink-0" data-testid="budget-uncategorized-amount">
          {MSG.spentOnly(formatAccountBalance(cents, currency))}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{MSG.uncategorizedHint}</p>
    </li>
  );
}
