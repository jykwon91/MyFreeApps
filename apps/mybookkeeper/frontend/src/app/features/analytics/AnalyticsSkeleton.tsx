import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

export default function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards row — 3 columns: total + 2 sub-categories visible, rest overflow */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {/* Total spend card (wider) */}
        <Card className="col-span-2 sm:col-span-1 lg:col-span-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28 mt-2" />
        </Card>
        {/* Per sub-category cards */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20 mt-2" />
          </Card>
        ))}
      </section>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Chart area */}
      <Card>
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[350px] w-full rounded" />
        {/* Legend row */}
        <div className="flex flex-wrap gap-4 mt-3 justify-center">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </Card>
    </div>
  );
}
