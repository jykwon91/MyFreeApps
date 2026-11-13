/**
 * Loading skeleton for /dashboard. Mirrors the loaded board: on desktop the
 * "Pipeline" header, three columns with two swim lanes each, and the Closed
 * accordion bar; on a phone the stage-by-stage list. Same wrapper classes as
 * KanbanBoard so nothing shifts when the board arrives.
 */
import { Skeleton, useMediaQuery } from "@platform/ui";
import { KANBAN_ACTIVE_COLUMNS } from "@myjobhunter/api-client/constants/kanbanActiveColumns";
import DashboardColumnSkeleton from "./DashboardColumnSkeleton";
import DashboardMobileSkeleton from "./DashboardMobileSkeleton";

export default function DashboardSkeleton() {
  const isMobile = useMediaQuery("(max-width: 767px)");

  if (isMobile) {
    return (
      <div className="p-4 space-y-6" aria-label="Loading dashboard" aria-busy="true">
        <DashboardMobileSkeleton />
      </div>
    );
  }

  return (
    <div
      className="p-4 sm:p-8 flex flex-col h-[calc(100vh-4rem)] min-h-0"
      aria-label="Loading dashboard"
      aria-busy="true"
    >
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <Skeleton className="h-4 w-32" />
      </header>
      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        {KANBAN_ACTIVE_COLUMNS.map((column) => (
          <DashboardColumnSkeleton key={column} />
        ))}
      </div>
      <div className="mt-4 rounded-lg border bg-muted/30 px-3 py-2">
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
}
