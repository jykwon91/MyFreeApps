import { useNavigate, useSearchParams } from "react-router-dom";
import { useGetBudgetMonthQuery } from "@mybookkeeper/api-client/store/budgetApi";
import { isMonthText, monthOf } from "@mybookkeeper/api-client/utils/monthText";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import BudgetBody from "@/app/features/budget/BudgetBody";
import BudgetMonthPicker from "@/app/features/budget/BudgetMonthPicker";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";
import { BUDGET_LINK_PAGES } from "@/shared/lib/budget-pages";

/**
 * A month's budget per personal spending category against what was spent.
 * The month is in the URL (``?month=YYYY-MM``) so a reload or a shared link
 * keeps it; changing it replaces the history entry rather than adding one.
 * ``currentData`` (not ``data``) so a month switch shows the skeleton, never
 * the previous month's figures under the new month's name.
 */
export default function Budget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentMonth = monthOf(new Date());
  const asked = searchParams.get("month");
  const month = isMonthText(asked) ? asked : currentMonth;
  const query = useGetBudgetMonthQuery(month);

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      <BudgetMonthPicker
        month={month}
        currentMonth={currentMonth}
        onChange={(next) => setSearchParams({ month: next }, { replace: true })}
      />
      <BudgetBody
        data={query.currentData}
        isLoading={query.currentData === undefined && query.isFetching}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        onAddCategory={() => void navigate(BUDGET_LINK_PAGES.categories)}
      />
    </div>
  );
}
