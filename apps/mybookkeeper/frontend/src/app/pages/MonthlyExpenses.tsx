import { useLiveSearchParams } from "@platform/ui";
import { useGetMonthlyExpensesQuery } from "@mybookkeeper/api-client/store/budgetApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import MonthlyExpensesBody from "@/app/features/monthly-expenses/MonthlyExpensesBody";
import MonthlyExpensesControls from "@/app/features/monthly-expenses/MonthlyExpensesControls";
import {
  monthlyExpensesQueryFrom,
  monthlyExpensesSearchParams,
} from "@/app/features/monthly-expenses/monthly-expenses-search-params";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";

/**
 * The average full month of spending across every account, where it goes,
 * and the payments behind each heading. Range and scope live in the URL so a
 * reload keeps them; a change replaces the history entry.
 */
export default function MonthlyExpenses() {
  const [searchParams, setSearchParams] = useLiveSearchParams();
  const expensesQuery = monthlyExpensesQueryFrom(searchParams);
  const query = useGetMonthlyExpensesQuery(expensesQuery);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      <MonthlyExpensesControls
        value={expensesQuery}
        onChange={(change) =>
          setSearchParams(
            (live) => new URLSearchParams(monthlyExpensesSearchParams({ ...monthlyExpensesQueryFrom(live), ...change })),
            { replace: true },
          )
        }
      />
      <MonthlyExpensesBody
        data={query.currentData}
        query={expensesQuery}
        isLoading={query.currentData === undefined && query.isFetching}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    </div>
  );
}
