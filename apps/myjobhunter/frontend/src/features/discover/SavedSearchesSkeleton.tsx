import { Card, Skeleton } from "@platform/ui";

/**
 * Loading skeleton for the saved-searches panel.
 *
 * Mirrors SavedSearchRow: source badge, query string, last-fetched
 * meta line, two action buttons (Refresh, Remove). No layout shift
 * on data arrival.
 */
export default function SavedSearchesSkeleton({ rows = 1 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-4 w-28" />
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
        </Card>
      ))}
    </div>
  );
}
