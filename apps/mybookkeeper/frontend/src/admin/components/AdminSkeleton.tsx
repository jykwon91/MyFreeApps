import Skeleton from "@/shared/components/ui/Skeleton";

export default function AdminSkeleton() {
  return (
    <div className="min-h-screen flex">
      {/* Mobile header skeleton */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-card border-b z-30 flex items-center px-4 md:hidden">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-5 w-14 ml-3" />
      </div>

      {/* Sidebar skeleton — hidden on mobile */}
      <aside className="hidden md:flex w-56 bg-card border-r flex-col">
        <div className="px-4 py-4 border-b space-y-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="px-3 py-4 space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
        {/* Sidebar footer */}
        <div className="mt-auto px-3 py-3 border-t space-y-2">
          <div className="flex justify-center">
            <Skeleton className="h-8 w-8 rounded" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <div className="space-y-1 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
      </aside>

      {/* Content skeleton */}
      <main className="flex-1 p-6 pt-14 md:pt-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border rounded-lg p-6 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div className="flex gap-4 border-b pb-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-muted">
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="px-4 py-3 border-t flex items-center gap-4">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
