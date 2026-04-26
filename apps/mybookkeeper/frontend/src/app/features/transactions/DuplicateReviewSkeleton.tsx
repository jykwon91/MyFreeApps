import Skeleton from "@/shared/components/ui/Skeleton";

export default function DuplicateReviewSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-3 p-4">
            <div className="flex-1 p-4 bg-muted/30 rounded-lg space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <div className="flex items-center">
              <Skeleton className="h-4 w-6" />
            </div>
            <div className="flex-1 p-4 bg-muted/30 rounded-lg space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-4 py-3 border-t">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
