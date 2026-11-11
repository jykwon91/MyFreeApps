import { Skeleton } from "@platform/ui";

/** A kanban card's footprint: logo, role, company and a badge row. */
export default function DashboardCardSkeleton() {
  return (
    <div data-skeleton-card className="rounded-md border bg-card p-3">
      <div className="flex items-start gap-2">
        <Skeleton className="w-6 h-6 rounded-full shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-20 mt-2" />
        </div>
      </div>
    </div>
  );
}
