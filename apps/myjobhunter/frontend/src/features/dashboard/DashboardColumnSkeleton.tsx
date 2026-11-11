import { Skeleton } from "@platform/ui";
import { KANBAN_LANE_ORDER } from "@myjobhunter/api-client/constants/kanbanLaneOrder";
import { DASHBOARD_SKELETON_CARDS_PER_LANE } from "@/constants/dashboard-skeleton";
import DashboardCardSkeleton from "./DashboardCardSkeleton";

/** One board column: header, both swim lanes (each with its header) and cards. */
export default function DashboardColumnSkeleton() {
  return (
    <section data-skeleton-column className="flex flex-col rounded-lg border bg-muted/30 min-h-0">
      <header className="flex items-center justify-between px-3 py-2 border-b">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-5" />
      </header>
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {KANBAN_LANE_ORDER.map((lane) => (
          <div key={lane} data-skeleton-lane className="mb-2 last:mb-0">
            <div className="flex items-center gap-1.5 px-1 py-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-4 ml-auto" />
            </div>
            <div className="space-y-2 pt-1">
              {Array.from({ length: DASHBOARD_SKELETON_CARDS_PER_LANE }, (_, i) => (
                <DashboardCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
