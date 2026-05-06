import { Skeleton } from "@platform/ui";

/**
 * Loading skeleton for the demo-users admin page.
 *
 * Mirrors the loaded layout exactly — page header, action button row,
 * three table rows. Skeleton cell widths match the loaded cells so the
 * layout doesn't shift when the data resolves.
 */
const SKELETON_ROWS = 3;

export default function DemoUsersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
