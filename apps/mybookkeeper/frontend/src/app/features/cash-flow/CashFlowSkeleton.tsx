import { LoadingRegion, Skeleton } from "@platform/ui";
import { CASH_FLOW_CHART_HEIGHT_CLASS, CASH_FLOW_TOTAL_TILES, CASH_FLOW_TOTALS_GRID_CLASS } from "@/shared/lib/budget-pages";
import { CASH_FLOW_MESSAGES as MSG } from "@/shared/lib/cash-flow-messages";
import CashBasisNoteSkeleton from "./CashBasisNoteSkeleton";

/** Same shape as the loaded view: what it counts, four totals, then the chart at its full height. */
export default function CashFlowSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="cash-flow-skeleton">
      <CashBasisNoteSkeleton />
      <div className={CASH_FLOW_TOTALS_GRID_CLASS}>
        {Array.from({ length: CASH_FLOW_TOTAL_TILES }, (_, i) => (
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
