import { LoadingRegion, Skeleton } from "@platform/ui";
import { CASH_FLOW_CHART_HEIGHT_CLASS } from "@/shared/lib/budget-pages";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";

const TOTAL_TILES = 3;

/** Same shape as the loaded view: three totals, then the chart at its full height. */
export default function CashFlowSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="cash-flow-skeleton">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: TOTAL_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="cash-flow-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-4" data-testid="cash-flow-skeleton-chart">
        <Skeleton className={`${CASH_FLOW_CHART_HEIGHT_CLASS} w-full`} />
      </div>
    </LoadingRegion>
  );
}
