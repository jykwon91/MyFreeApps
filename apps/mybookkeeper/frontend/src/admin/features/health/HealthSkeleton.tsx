import Skeleton from "@/shared/components/ui/Skeleton";

export default function HealthSkeleton() {
  return (
    <div className="space-y-4">
      {/* SectionHeader */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>

      {/* Status indicator — small dot + label */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>

      {/* Stats grid — 6 cards, 3-col on lg */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </section>

      {/* Recent Activity — filter bar + table */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-36 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b">
              <tr>
                {["w-24", "w-32", "w-20", "w-48"].map((w, i) => (
                  <th key={i} className="px-4 py-3 text-left">
                    <Skeleton className={`h-3 ${w}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="border-b">
                  <td className="px-4 py-3"><Skeleton className="h-3 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-28 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-3 w-48" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
