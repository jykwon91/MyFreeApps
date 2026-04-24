import { Skeleton } from "@platform/ui";

export default function ProfileSkeleton() {
  return (
    <div
      className="p-6 space-y-6 max-w-3xl"
      aria-label="Loading profile"
      aria-busy="true"
    >
      {/* Resume card */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Work History card */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 py-1">
            <Skeleton className="h-10 w-10 rounded shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* Education card */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* Skills card */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-16" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>

      {/* Screening Answers card */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
