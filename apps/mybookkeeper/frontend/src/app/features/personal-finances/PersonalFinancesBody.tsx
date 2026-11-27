import { Link } from "react-router-dom";
import type { PersonalFinances } from "@mybookkeeper/api-client/types/personal-finances/personal-finances";
import { personalFinancesChartRows } from "@mybookkeeper/api-client/utils/personalFinancesChartRows";
import CashBasisNote from "@/app/features/cash-flow/CashBasisNote";
import Card from "@/shared/components/ui/Card";
import EmptyState from "@/shared/components/ui/EmptyState";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import { PERSONAL_FINANCES_BREAKDOWN_GRID_CLASS, PERSONAL_FINANCES_LINKS } from "@/shared/lib/personal-finances-pages";
import PersonalFinancesCategories from "./PersonalFinancesCategories";
import PersonalFinancesChart from "./PersonalFinancesChart";
import PersonalFinancesIncomeSplit from "./PersonalFinancesIncomeSplit";
import PersonalFinancesNoBank from "./PersonalFinancesNoBank";
import PersonalFinancesOneOffs from "./PersonalFinancesOneOffs";
import PersonalFinancesSkeleton from "./PersonalFinancesSkeleton";
import PersonalFinancesTiles from "./PersonalFinancesTiles";

export interface PersonalFinancesBodyProps {
  data: PersonalFinances | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onRangeSelect: (range: DateRange) => void;
}

export default function PersonalFinancesBody({
  data, isLoading, isError, isRetrying, onRetry, onRangeSelect,
}: PersonalFinancesBodyProps) {
  if (isLoading) return <PersonalFinancesSkeleton />;
  if (isError || !data) return <LoadErrorAlert message={MSG.loadFailed} isRetrying={isRetrying} onRetry={onRetry} />;
  if (data.bank_history_start === null) return <PersonalFinancesNoBank />;

  const isEmpty = data.totals.income_cents === 0 && data.totals.expenses_cents === 0;

  return (
    <div className="space-y-6">
      <CashBasisNote bankHistoryStart={data.bank_history_start} />
      <PersonalFinancesTiles data={data} />
      <Card title={MSG.chartTitle}>
        {isEmpty ? (
          <EmptyState message={MSG.empty} />
        ) : (
          <>
            <PersonalFinancesChart rows={personalFinancesChartRows(data.months)} onRangeSelect={onRangeSelect} />
            <p className="mt-2 hidden text-xs text-muted-foreground sm:block">{MSG.dragHint}</p>
          </>
        )}
      </Card>
      <div className={PERSONAL_FINANCES_BREAKDOWN_GRID_CLASS}>
        <PersonalFinancesIncomeSplit data={data} />
        <PersonalFinancesCategories data={data} />
      </div>
      <PersonalFinancesOneOffs data={data} />
      <Link
        to={PERSONAL_FINANCES_LINKS.cashFlow}
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline"
      >
        {MSG.seeCashFlow}
      </Link>
    </div>
  );
}
