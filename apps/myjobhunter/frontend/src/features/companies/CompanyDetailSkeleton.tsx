import { Skeleton } from "@platform/ui";

export default function CompanyDetailSkeleton() {
  return (
    <div
      className="p-6 space-y-6"
      aria-label="Loading company detail"
      aria-busy="true"
    >
      {/* Company header card */}
      <div className="border rounded-lg p-6 flex gap-5">
        <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      </div>

      {/* About section */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Applications at this company */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
