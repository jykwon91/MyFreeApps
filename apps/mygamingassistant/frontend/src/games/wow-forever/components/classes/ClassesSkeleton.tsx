/** Skeleton grid that mirrors the 9-class index — prevents layout shift on first load. */
export default function ClassesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3 min-h-[44px]">
          <div className="shrink-0 rounded border bg-muted" style={{ width: 40, height: 40 }} />
          <div className="min-w-0 space-y-1.5">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
