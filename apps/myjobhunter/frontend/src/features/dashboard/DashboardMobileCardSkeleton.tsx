import { Skeleton } from "@platform/ui";

/**
 * A phone-list card's footprint, mirroring KanbanMobileCard: no logo, the
 * 44px open area with role, company and a badge row, and the Move button.
 */
export default function DashboardMobileCardSkeleton() {
  return (
    <div data-skeleton-card className="flex items-center gap-2 rounded-md border bg-card pr-2">
      <div data-skeleton-open className="min-h-[44px] min-w-0 flex-1 p-3 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-5 w-20 mt-2" />
      </div>
      <div data-skeleton-move className="shrink-0">
        <Skeleton className="h-[44px] w-[52px] rounded-md" />
      </div>
    </div>
  );
}
