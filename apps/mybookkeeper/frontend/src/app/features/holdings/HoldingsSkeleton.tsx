import { LoadingRegion, Skeleton } from "@platform/ui";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

const TOTAL_TILES = 3;
const ALLOCATION_ROWS = 3;
const HOLDING_ROWS = 4;

/** Same shape as the loaded page: three totals, the allocation, then the holdings. */
export default function HoldingsSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="holdings-skeleton">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: TOTAL_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="holdings-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-4 space-y-3" data-testid="holdings-skeleton-allocation">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: ALLOCATION_ROWS }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
      <div className="border rounded-lg p-4 space-y-3" data-testid="holdings-skeleton-list">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: HOLDING_ROWS }, (_, i) => (
          <div key={i} data-testid="holdings-skeleton-row">
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
