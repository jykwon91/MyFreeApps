import { useGetMonthlyExpenseCategoryQuery } from "@mybookkeeper/api-client/store/budgetApi";
import type { MonthlyExpensesQuery } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expenses-query";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import MonthlyExpenseDetailSkeleton from "./MonthlyExpenseDetailSkeleton";
import MonthlyExpensePayeeList from "./MonthlyExpensePayeeList";
import MonthlyExpenseTransactionList from "./MonthlyExpenseTransactionList";

export interface MonthlyExpenseCategoryDetailProps {
  label: string;
  query: MonthlyExpensesQuery;
}

/** The payments counted under one heading, and who got how much. Loaded when the heading opens. */
export default function MonthlyExpenseCategoryDetail({ label, query }: MonthlyExpenseCategoryDetailProps) {
  const detail = useGetMonthlyExpenseCategoryQuery({ ...query, label });
  const data = detail.currentData;

  if (data === undefined && detail.isFetching) return <MonthlyExpenseDetailSkeleton label={label} />;
  if (detail.isError || data === undefined) {
    return <LoadErrorAlert message={MSG.detailLoadFailed} isRetrying={detail.isFetching} onRetry={() => void detail.refetch()} />;
  }
  if (data.transactions.length === 0) return <EmptyState message={MSG.detailEmpty} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="monthly-expense-detail">
      <MonthlyExpensePayeeList payees={data.payees} currency={data.currency} />
      <MonthlyExpenseTransactionList transactions={data.transactions} currency={data.currency} />
    </div>
  );
}
