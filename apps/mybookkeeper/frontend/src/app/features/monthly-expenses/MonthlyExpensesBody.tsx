import type { MonthlyExpenses } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses";
import type { MonthlyExpensesQuery } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses-query";
import { formatAccountBalance } from "@mybookkeeper/api-client/utils/financialAccountFormat";
import { formatMonthLong } from "@mybookkeeper/api-client/utils/monthText";
import CashBasisNote from "@/app/features/cash-flow/CashBasisNote";
import FinancialAccountTotalTile from "@/app/features/financial-accounts/FinancialAccountTotalTile";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import MonthlyExpenseCategoryRow from "./MonthlyExpenseCategoryRow";
import MonthlyExpensesSkeleton from "./MonthlyExpensesSkeleton";

export interface MonthlyExpensesBodyProps {
  data: MonthlyExpenses | undefined;
  /** The months and money on screen, so an opened heading lists the same payments. */
  query: MonthlyExpensesQuery;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

export default function MonthlyExpensesBody({ data, query, isLoading, isError, isRetrying, onRetry }: MonthlyExpensesBodyProps) {
  if (isLoading) return <MonthlyExpensesSkeleton range={query.range} />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;

  const money = (cents: number) => formatAccountBalance(cents, data.currency);

  return (
    <div className="space-y-6">
      <CashBasisNote bankHistoryStart={data.bank_history_start} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="monthly-expenses-totals">
        <FinancialAccountTotalTile
          label={MSG.averagePerMonth}
          value={money(data.average_cents)}
          testId="monthly-expenses-average"
          emphasis
        />
        <FinancialAccountTotalTile
          label={MSG.totalOver(data.months.length)}
          value={money(data.total_cents)}
          testId="monthly-expenses-total"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2" data-testid="monthly-expenses-breakdown">
          <h2 className="text-sm font-semibold">{MSG.breakdownTitle}</h2>
          {data.categories.length === 0 ? (
            <EmptyState message={MSG.empty} />
          ) : (
            <ul className="space-y-2">
              {data.categories.map((category) => (
                <MonthlyExpenseCategoryRow key={category.label} category={category} currency={data.currency} query={query} />
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-3" data-testid="monthly-expenses-months">
          <h2 className="text-sm font-semibold">{MSG.monthsTitle}</h2>
          <ul className="divide-y rounded-lg border">
            {data.months.map((month) => (
              <li key={month.month} className="flex items-center justify-between gap-3 px-4 py-3 text-sm" data-testid="monthly-expenses-month">
                <span>{formatMonthLong(month.month)}</span>
                <span className="font-medium tabular-nums">{money(month.total_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
