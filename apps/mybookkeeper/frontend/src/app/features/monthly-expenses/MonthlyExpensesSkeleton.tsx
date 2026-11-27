import { LoadingRegion, Skeleton } from "@platform/ui";
import { MONTHLY_EXPENSE_RANGES } from "@mybookkeeper/api-client/constants/monthlyExpenses";
import type { MonthlyExpenseRange } from "@mybookkeeper/api-client/types/monthly-expenses/monthly-expense-range";
import CashBasisNoteSkeleton from "@/app/features/cash-flow/CashBasisNoteSkeleton";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";
import { MONTHLY_EXPENSE_SKELETON_CATEGORIES } from "@/shared/lib/monthly-expenses-pages";

const TOTAL_TILES = 2;

export interface MonthlyExpensesSkeletonProps {
  range: MonthlyExpenseRange;
}

/** Same shape as the loaded view: what it counts, two totals, then the breakdown beside one row per month. */
export default function MonthlyExpensesSkeleton({ range }: MonthlyExpensesSkeletonProps) {
  const monthCount = MONTHLY_EXPENSE_RANGES.find((option) => option.key === range)?.months ?? 0;
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="monthly-expenses-skeleton">
      <CashBasisNoteSkeleton />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: TOTAL_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="monthly-expenses-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2" data-testid="monthly-expenses-skeleton-breakdown">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: MONTHLY_EXPENSE_SKELETON_CATEGORIES }, (_, i) => (
            <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="monthly-expenses-skeleton-category">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="space-y-3" data-testid="monthly-expenses-skeleton-months">
          <Skeleton className="h-4 w-24" />
          <div className="divide-y rounded-lg border">
            {Array.from({ length: monthCount }, (_, i) => (
              <div key={i} className="flex justify-between gap-3 px-4 py-3" data-testid="monthly-expenses-skeleton-month">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
