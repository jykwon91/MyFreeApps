import { Skeleton } from "@platform/ui";

/**
 * Mirrors the loaded discovery grid — same card count, same 16:10 image band,
 * same text-line rhythm — so results replace the skeleton without shifting the
 * page. Searching takes tens of seconds, which is long enough that a bare
 * spinner reads as a hang.
 */
export default function DiscoveryResultsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Searching the web for recipes"
      aria-busy="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border bg-card">
          <Skeleton className="aspect-[16/10] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
