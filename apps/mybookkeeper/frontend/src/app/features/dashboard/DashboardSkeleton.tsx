import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* SectionHeader: "Dashboard" + subtitle */}
      <div>
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-56 mt-1" />
      </div>

      {/* Summary cards — 3 columns matching SummaryCard */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-32 mt-1" />
          </Card>
        ))}
      </section>

      {/* Filter bar — matches DashboardFilterBar */}
      <div className="bg-card border rounded-lg px-4 py-3 flex items-center gap-3">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-9 w-36 rounded-md" />
        <div className="flex gap-2 ml-2">
          <Skeleton className="h-8 w-12 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <Skeleton className="h-4 w-4 ml-auto" />
      </div>

      {/* Monthly Overview chart — matches Card title="Monthly Overview" */}
      <Card>
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[300px] w-full rounded" />
        {/* Legend row */}
        <div className="flex gap-4 mt-3 justify-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </Card>

      {/* By Property table — matches Card with table inside */}
      <Card className="overflow-hidden p-0">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-5 w-28" />
        </div>
        {/* Table header */}
        <div className="grid grid-cols-4 px-6 py-3 gap-4 bg-muted/50">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-4 w-16 ml-auto" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
        {/* Table rows */}
        <div className="divide-y">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-4 px-6 py-3 gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      </Card>

      {/* Monthly by Property — 2-col grid of chart cards */}
      <section className="space-y-4">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-32 mb-3" />
              <Skeleton className="h-[200px] w-full rounded" />
            </Card>
          ))}
        </div>
      </section>

      {/* By Category chart */}
      <Card>
        <Skeleton className="h-5 w-28 mb-4" />
        <Skeleton className="h-48 w-full rounded" />
      </Card>
    </div>
  );
}
