import { Skeleton } from "@platform/ui";

const PLACEHOLDER_ROWS = 3;

/** Heading + a few card rows: the shape of the onboarding / scenario pages. */
export default function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-7 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-1/2 max-w-xs" />
      <div className="space-y-3">
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
