/**
 * LiveStripSkeleton — horizontal placeholder for the live mode lineup
 * strip while the `/api/lineups` query is in flight.
 *
 * Renders 6 fixed-width skeleton cards matching the production strip's
 * thumbnail aspect ratio. Forbids layout shift when real cards arrive.
 */
export default function LiveStripSkeleton() {
  return (
    <div className="flex gap-3 h-full" aria-label="Loading lineups">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="w-64 shrink-0 rounded-lg border bg-card overflow-hidden"
        >
          <div className="w-full aspect-video bg-muted/40 animate-pulse" />
          <div className="px-2 py-2 space-y-1">
            <div className="h-3 w-3/4 bg-muted/40 rounded animate-pulse" />
            <div className="h-2 w-1/2 bg-muted/30 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
