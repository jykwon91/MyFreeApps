import { LoadingRegion, Skeleton } from "@platform/ui";
import { BUDGET_MESSAGES as MSG } from "@/shared/lib/budget-messages";

const SUMMARY_TILES = 3;
const SKELETON_ROWS = 5;

/** Same shape as the loaded page: three summary tiles and a bar, then category rows with their bars. */
export default function BudgetSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="budget-skeleton">
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: SUMMARY_TILES }, (_, i) => (
            <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="budget-skeleton-tile">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ))}
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      <ul className="space-y-2">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <li key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="budget-skeleton-row">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3 w-24" />
          </li>
        ))}
      </ul>
    </LoadingRegion>
  );
}
