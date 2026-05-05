import { Skeleton } from "@platform/ui";

export default function DocumentsSkeleton() {
  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Kind filter */}
      <Skeleton className="h-8 w-40" />

      {/* Document rows */}
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start justify-between gap-3 p-3 border rounded-lg">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
