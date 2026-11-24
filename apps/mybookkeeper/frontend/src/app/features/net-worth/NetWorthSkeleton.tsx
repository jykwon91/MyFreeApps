import { LoadingRegion, Skeleton } from "@platform/ui";
import { NET_WORTH_CHART_HEIGHT_CLASS } from "@/shared/lib/net-worth-chart";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";

const HEADLINE_TILES = 3;
const SKELETON_GROUPS = [2, 1, 1] as const;

/** Same shape as the loaded page: three headline tiles, the chart card, then groups of rows. */
export default function NetWorthSkeleton() {
  return (
    <LoadingRegion label={MSG.loading} className="space-y-6" data-testid="net-worth-skeleton">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: HEADLINE_TILES }, (_, i) => (
          <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="net-worth-skeleton-tile">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-4 space-y-3" data-testid="net-worth-skeleton-history">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className={`w-full ${NET_WORTH_CHART_HEIGHT_CLASS}`} />
      </div>
      {SKELETON_GROUPS.map((rows, group) => (
        <div key={group} className="space-y-2" data-testid="net-worth-skeleton-group">
          <div className="flex justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="border rounded-lg px-4 py-3 space-y-2" data-testid="net-worth-skeleton-row">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ))}
    </LoadingRegion>
  );
}
