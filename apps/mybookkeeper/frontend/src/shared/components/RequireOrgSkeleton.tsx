import Skeleton from "@/shared/components/ui/Skeleton";

export default function RequireOrgSkeleton() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar skeleton */}
      <aside className="hidden md:flex w-56 bg-card border-r flex-col shrink-0">
        <div className="px-4 py-5 border-b">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="px-3 py-4 space-y-1">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </aside>
      {/* Content skeleton — dashboard layout */}
      <main className="flex-1 p-4 sm:p-8 space-y-6">
        <Skeleton className="h-8 w-36" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border rounded-lg p-6 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
            </div>
          ))}
        </div>
        <div className="border rounded-lg px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <div className="flex gap-2 ml-2">
            <Skeleton className="h-8 w-12 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
        <div className="border rounded-lg p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <Skeleton className="h-[300px] w-full rounded" />
        </div>
      </main>
    </div>
  );
}
