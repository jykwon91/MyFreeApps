import { Skeleton } from "@platform/ui";

/**
 * ProfileSkeleton — mirrors the loaded Profile layout exactly.
 *
 * Sections in order:
 *   1. Header (avatar + summary)
 *   2. Salary preferences (2 data cells)
 *   3. Locations (tags + remote toggles)
 *   4. Work history (2 entries)
 *   5. Education (1 entry)
 *   6. Skills (6 tag chips)
 *   7. Screening answers (2 rows)
 */
export default function ProfileSkeleton() {
  return (
    <div
      className="p-6 space-y-6 max-w-3xl"
      aria-label="Loading profile"
      aria-busy="true"
    >
      {/* 1. Header */}
      <div className="border rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </div>

      {/* 2. Salary preferences */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-36" />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>

      {/* 3. Locations */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* 4. Work history (2 entries) */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-28" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-1">
            <Skeleton className="h-9 w-9 rounded shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>

      {/* 5. Education (1 entry) */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>

      {/* 6. Skills (6 chips) */}
      <div className="border rounded-lg p-6 space-y-3">
        <Skeleton className="h-5 w-16" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>

      {/* 7. Screening answers (2 rows) */}
      <div className="border rounded-lg p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
