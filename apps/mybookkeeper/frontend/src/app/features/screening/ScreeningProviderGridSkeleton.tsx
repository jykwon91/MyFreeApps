import Skeleton from "@/shared/components/ui/Skeleton";

export default function ScreeningProviderGridSkeleton() {
  return (
    <div
      data-testid="screening-provider-grid-skeleton"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      aria-hidden="true"
    >
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-12 w-full rounded" />
          <div className="flex gap-3">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
          <div className="flex justify-between">
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-8 w-28 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
