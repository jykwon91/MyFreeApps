/** The lineup list's loading state: two zone sections of four rows each. */
export default function LineupListSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((s) => (
        <div key={s} className="space-y-2">
          <div className="h-5 w-48 bg-muted/40 rounded animate-pulse" />
          <div className="rounded-lg border divide-y">
            {[1, 2, 3, 4].map((r) => (
              <div key={r} className="h-9 bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
