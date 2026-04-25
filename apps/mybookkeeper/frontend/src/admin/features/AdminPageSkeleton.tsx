import Skeleton from "@/shared/components/ui/Skeleton";
import Card from "@/shared/components/ui/Card";

export default function AdminPageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* SectionHeader */}
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-44 mt-1" />
      </div>

      {/* Stats cards — 4 cards matching StatsCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-20 mt-1" />
          </Card>
        ))}
      </div>

      {/* Tab bar */}
      <div className="border-b">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-4 w-24 mb-2" />
        </div>
      </div>

      {/* Search bar */}
      <Skeleton className="h-10 w-64" />

      {/* Table header */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 px-4 py-3 bg-muted/50 gap-4">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
        {/* Table rows */}
        <div className="divide-y">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-7 px-4 py-3 gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
