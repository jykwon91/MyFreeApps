import Skeleton from "@/shared/components/ui/Skeleton";

export default function AttributionReviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          data-testid="attribution-review-skeleton-row"
          className="flex flex-col sm:flex-row sm:items-start gap-4 p-4 border rounded-lg bg-card"
        >
          <div data-testid="attribution-review-skeleton-main" className="flex-1 space-y-1 min-w-0">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div data-testid="attribution-review-skeleton-actions" className="flex items-center gap-2 shrink-0">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
