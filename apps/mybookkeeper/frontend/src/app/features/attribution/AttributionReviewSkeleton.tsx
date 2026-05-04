import Skeleton from "@/shared/components/ui/Skeleton";

export default function AttributionReviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border rounded-lg">
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
