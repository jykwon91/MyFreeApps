/** Skeleton loader for the server status section.
 *  Mirrors the loaded layout: region picker + 4 ruleset badges + "last checked" line.
 */
export default function ServerStatusSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading server status">
      {/* Region picker + heading row */}
      <div className="flex items-center justify-between mb-3">
        <div className="h-5 w-32 rounded bg-muted/40 animate-pulse" aria-hidden />
        <div className="h-8 w-28 rounded bg-muted/40 animate-pulse" aria-hidden />
      </div>
      {/* 4 ruleset badge rows */}
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-muted/40 animate-pulse" aria-hidden />
            <div className="h-4 w-24 rounded bg-muted/40 animate-pulse" aria-hidden />
          </div>
        ))}
      </div>
      {/* "Last checked" line */}
      <div className="mt-3 h-3 w-40 rounded bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}
