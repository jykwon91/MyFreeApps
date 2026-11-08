const ROWS = [0, 1, 2, 3];

/** Mirrors the loaded history: 4 ruleset rows (name + uptime, bar, streak line), legend, outage list. */
export default function ServerStatusHistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading uptime history" data-testid="history-skeleton" className="space-y-4">
      <ul className="space-y-4">
        {ROWS.map((i) => (
          <li key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <div className="h-4 w-24 rounded bg-muted/40 animate-pulse" aria-hidden />
              <div className="h-4 w-16 rounded bg-muted/40 animate-pulse" aria-hidden />
            </div>
            <div className="h-3 w-full rounded-full bg-muted/40 animate-pulse" aria-hidden />
            <div className="h-3 w-32 rounded bg-muted/40 animate-pulse" aria-hidden />
          </li>
        ))}
      </ul>
      <div className="h-3 w-48 rounded bg-muted/40 animate-pulse" aria-hidden />
      <div className="space-y-2">
        <div className="h-4 w-44 rounded bg-muted/40 animate-pulse" aria-hidden />
        <div className="h-16 w-full rounded-lg bg-muted/40 animate-pulse" aria-hidden />
      </div>
    </div>
  );
}
