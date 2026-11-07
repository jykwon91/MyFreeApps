import Skeleton from "@/shared/components/ui/Skeleton";

export default function ScreeningSectionSkeleton() {
  return (
    <div
      data-testid="screening-section-skeleton"
      className="space-y-3"
      aria-hidden="true"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border p-4 space-y-3">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded" />
            <Skeleton className="h-8 w-28 rounded self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}
