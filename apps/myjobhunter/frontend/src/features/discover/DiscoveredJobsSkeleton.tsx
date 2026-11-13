import { Card, Skeleton } from "@platform/ui";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoveredJobsSkeletonProps {
  count?: number;
  /** The Dismissed view's cards end in a dismissal line and Open + Restore instead of the triage buttons. */
  view?: DiscoverView;
}

/**
 * Loading skeleton for a /discover card list.
 *
 * Cell widths mirror DiscoveredJobCard's loaded layout:
 *   - Title (~60% width)
 *   - Company + location (~40%)
 *   - Three meta chips
 *   - Description body (3 short lines)
 *   - Footer: the triage buttons, or (Dismissed) the dismissal line and Open + Restore
 *
 * No layout shift on first data arrival.
 */
export default function DiscoveredJobsSkeleton({ count = 3, view = "inbox" }: DiscoveredJobsSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true" data-testid="discovered-jobs-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4 sm:p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          {view === "dismissed" ? (
            <div className="space-y-2 pt-1">
              <Skeleton className="h-3 w-1/3" />
              <div className="flex gap-2" data-testid="skeleton-actions">
                <Skeleton className="h-9 w-16" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1" data-testid="skeleton-actions">
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-16" />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
