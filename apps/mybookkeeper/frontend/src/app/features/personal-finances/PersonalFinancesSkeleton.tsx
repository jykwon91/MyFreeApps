import { LoadingRegion, Skeleton } from "@platform/ui";
import CashBasisNoteSkeleton from "@/app/features/cash-flow/CashBasisNoteSkeleton";
import { PERSONAL_FINANCES_MESSAGES as MSG } from "@/shared/lib/personal-finances-messages";
import {
  PERSONAL_FINANCES_BREAKDOWN_GRID_CLASS,
  PERSONAL_FINANCES_BREAKDOWN_SKELETON_ROWS,
  PERSONAL_FINANCES_CHART_HEIGHT_CLASS,
  PERSONAL_FINANCES_TILES,
  PERSONAL_FINANCES_TILES_GRID_CLASS,
} from "@/shared/lib/personal-finances-pages";

const BREAKDOWNS = 2;

/** Same shape as the loaded page: what it counts, four tiles, the chart, then the two breakdowns. */
export default function PersonalFinancesSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="personal-finances-skeleton">
      <CashBasisNoteSkeleton />
      <div className={PERSONAL_FINANCES_TILES_GRID_CLASS}>
        {Array.from({ length: PERSONAL_FINANCES_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="personal-finances-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-6" data-testid="personal-finances-skeleton-chart">
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className={`${PERSONAL_FINANCES_CHART_HEIGHT_CLASS} w-full`} />
      </div>
      <div className={PERSONAL_FINANCES_BREAKDOWN_GRID_CLASS}>
        {Array.from({ length: BREAKDOWNS }, (_, i) => (
          <div key={i} className="border rounded-lg p-6 space-y-4" data-testid="personal-finances-skeleton-breakdown">
            <Skeleton className="h-4 w-1/3" />
            {Array.from({ length: PERSONAL_FINANCES_BREAKDOWN_SKELETON_ROWS }, (_, row) => (
              <Skeleton key={row} className="h-6 w-full" />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
