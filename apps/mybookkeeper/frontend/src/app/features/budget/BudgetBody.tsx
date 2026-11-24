import type { BudgetMonth } from "@mybookkeeper/api-client/types/budget/budget-month";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";
import BudgetCategoryRow from "./BudgetCategoryRow";
import BudgetSkeleton from "./BudgetSkeleton";
import BudgetSummary from "./BudgetSummary";
import BudgetUncategorizedRow from "./BudgetUncategorizedRow";

export interface BudgetBodyProps {
  data: BudgetMonth | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onAddCategory: () => void;
}

export default function BudgetBody({ data, isLoading, isError, isRetrying, onRetry, onAddCategory }: BudgetBodyProps) {
  if (isLoading) return <BudgetSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;
  if (data.lines.length === 0 && data.uncategorized_spent_cents === 0) {
    return <EmptyState message={MSG.empty} action={{ label: MSG.emptyAction, onClick: onAddCategory }} />;
  }

  return (
    <div className="space-y-6">
      <BudgetSummary budget={data} />
      <ul className="space-y-2" data-testid="budget-lines">
        {data.lines.map((line) => (
          <BudgetCategoryRow key={line.spending_category_id} line={line} currency={data.currency} month={data.month} />
        ))}
        {data.uncategorized_spent_cents !== 0 ? (
          <BudgetUncategorizedRow cents={data.uncategorized_spent_cents} currency={data.currency} />
        ) : null}
      </ul>
      <p className="text-xs text-muted-foreground">{MSG.howItCounts}</p>
    </div>
  );
}
