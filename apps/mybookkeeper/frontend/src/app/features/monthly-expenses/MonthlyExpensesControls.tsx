import { CASH_FLOW_SCOPES } from "@mybookkeeper/api-client/constants/budget";
import { MONTHLY_EXPENSE_RANGES } from "@mybookkeeper/api-client/constants/monthlyExpenses";
import type { MonthlyExpensesQuery } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses-query";
import SegmentedControl from "@/shared/components/ui/SegmentedControl";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";

export interface MonthlyExpensesControlsProps {
  value: MonthlyExpensesQuery;
  /** Only the picked field, so a change can't carry stale values for the other. */
  onChange: (change: Partial<MonthlyExpensesQuery>) => void;
}

/** How many full months to average, and which money (personal, rental, business or all). */
export default function MonthlyExpensesControls({ value, onChange }: MonthlyExpensesControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="monthly-expenses-controls">
      <SegmentedControl
        options={MONTHLY_EXPENSE_RANGES}
        value={value.range}
        onChange={(range) => onChange({ range })}
        label={MSG.rangeLabel}
        testIdPrefix="monthly-expenses-range"
      />
      <SegmentedControl
        options={CASH_FLOW_SCOPES}
        value={value.scope}
        onChange={(scope) => onChange({ scope })}
        label={MSG.scopeLabel}
        testIdPrefix="monthly-expenses-scope"
      />
    </div>
  );
}
