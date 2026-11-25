import { LoadingRegion, Skeleton } from "@platform/ui";
import { MONTHLY_EXPENSES_MESSAGES as MSG } from "@/shared/lib/monthly-expenses-messages";

const PAYEE_ROWS = 3;
const PAYMENT_ROWS = 3;

export interface MonthlyExpenseDetailSkeletonProps {
  label: string;
}

/** Same shape as a loaded heading: the payee totals, then the payment cards. */
export default function MonthlyExpenseDetailSkeleton({ label }: MonthlyExpenseDetailSkeletonProps) {
  return (
    <LoadingRegion label={MSG.detailLoading(label)} className="grid gap-4 lg:grid-cols-2" data-testid="monthly-expense-detail-skeleton">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="divide-y rounded-md border">
          {Array.from({ length: PAYEE_ROWS }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-3 py-2" data-testid="monthly-expense-detail-skeleton-payee">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: PAYMENT_ROWS }, (_, i) => (
          <div key={i} className="border rounded-md px-3 py-2 space-y-2" data-testid="monthly-expense-detail-skeleton-payment">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
