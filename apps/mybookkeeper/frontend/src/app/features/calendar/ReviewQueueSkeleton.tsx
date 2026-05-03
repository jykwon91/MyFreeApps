import Skeleton from "@/shared/components/ui/Skeleton";

const SKELETON_COUNT = 3;

/**
 * Skeleton loader for the review queue drawer — matches the ReviewQueueItem
 * layout to prevent layout shift on load.
 */
export default function ReviewQueueSkeleton() {
  return (
    <div
      className="space-y-4"
      data-testid="review-queue-skeleton"
      aria-busy="true"
      aria-label="Loading review queue"
    >
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border p-4 space-y-3"
        >
          {/* Channel badge + subject line */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
          {/* Date range + price */}
          <div className="flex gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          {/* Action buttons */}
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
