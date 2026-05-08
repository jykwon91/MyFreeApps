import { Card, Skeleton } from "@platform/ui";

/**
 * Loading skeleton for the /discover inbox card list.
 *
 * Cell widths mirror DiscoveredJobCard's loaded layout:
 *   - Title (~60% width)
 *   - Company + location (~40%)
 *   - Three meta chips
 *   - Description body (3 short lines)
 *   - Action button row (4 fixed-width buttons)
 *
 * No layout shift on first data arrival.
 */
export default function DiscoveredJobsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
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
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-16" />
          </div>
        </Card>
      ))}
    </div>
  );
}
