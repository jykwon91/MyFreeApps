import { Skeleton } from "@platform/ui";

export default function ApplicationDetailSkeleton() {
  return (
    <div
      className="flex gap-6 p-6"
      aria-label="Loading application detail"
      aria-busy="true"
    >
      {/* Left sidebar */}
      <aside className="w-64 shrink-0 space-y-6">
        {/* Status badge */}
        <div className="border rounded-lg p-4 space-y-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        {/* Timeline */}
        <div className="border rounded-lg p-4 space-y-4">
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="h-4 w-4 rounded-full shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-6 border-b pb-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>

        {/* JD text block */}
        <div className="border rounded-lg p-6 space-y-2.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
