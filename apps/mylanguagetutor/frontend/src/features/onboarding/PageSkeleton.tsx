import { LoadingRegion, Skeleton } from "@platform/ui";

const PLACEHOLDER_ROWS = 3;

interface PageSkeletonProps {
  /** What a screen reader hears while this loads. */
  label: string;
}

/** Heading + a few card rows: the shape of the onboarding / scenario pages. */
export default function PageSkeleton({ label }: PageSkeletonProps) {
  return (
    <LoadingRegion label={label} className="space-y-4">
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
    </LoadingRegion>
  );
}
