import { Skeleton } from "@platform/ui";
import { KANBAN_COLUMN_ORDER } from "@myjobhunter/api-client/constants/kanbanColumnOrder";
import DashboardMobileCardSkeleton from "./DashboardMobileCardSkeleton";

/** The phone-width list: one section per stage, a heading with its count, then cards. */
export default function DashboardMobileSkeleton() {
  return (
    <div className="space-y-4">
      {KANBAN_COLUMN_ORDER.map((column) => (
        <section key={column} data-skeleton-column className="space-y-2">
          <header className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-5" />
          </header>
          <DashboardMobileCardSkeleton />
        </section>
      ))}
    </div>
  );
}
