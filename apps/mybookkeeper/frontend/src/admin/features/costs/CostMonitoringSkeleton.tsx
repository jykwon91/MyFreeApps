export default function CostMonitoringSkeleton() {
  return (
    <div className="p-4 sm:p-6 space-y-3">
      {/* SectionHeader */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-7 w-40 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Cost cards -- 3-col on lg */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </section>

      {/* Chart + table -- 2-col on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="h-4 w-44 animate-pulse rounded bg-muted" />
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />
          </div>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
