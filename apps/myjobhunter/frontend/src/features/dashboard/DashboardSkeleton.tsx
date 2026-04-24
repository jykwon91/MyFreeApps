import { Skeleton } from "@platform/ui";

export default function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6" aria-label="Loading dashboard" aria-busy="true">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Funnel chart area */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-[280px] w-full" />
      </div>

      {/* Recent activity */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
