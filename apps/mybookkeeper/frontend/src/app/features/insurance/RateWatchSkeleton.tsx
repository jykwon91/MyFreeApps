/**
 * Loading placeholder for the rate-watch check.
 *
 * Mirrors the loaded section: two bordered policy cards, each with a heading
 * row, a headline line, a projection line and two filing rows, then the market
 * list with its heading and five rows. Same shape means no layout shift when
 * the department answers.
 */
export default function RateWatchSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="rate-watch-loading"
    >
      <ul className="space-y-3">
        {[1, 2].map((card) => (
          <li key={card} className="rounded-lg border border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="h-4 bg-muted rounded w-40" />
              <div className="h-3 bg-muted rounded w-28" />
            </div>
            <div className="h-4 bg-muted rounded w-56 mt-2" />
            <div className="h-6 bg-muted rounded w-64 mt-1" />
            <div className="mt-3 space-y-2">
              {[1, 2].map((row) => (
                <div key={row} className="flex items-center gap-3 py-1">
                  <div className="h-4 bg-muted rounded flex-1" />
                  <div className="h-4 w-16 bg-muted rounded" />
                  <div className="h-4 w-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <section className="rounded-lg border border-border p-4">
        <div className="h-4 bg-muted rounded w-48" />
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center gap-3 py-1">
              <div className="h-4 bg-muted rounded flex-1" />
              <div className="h-4 w-16 bg-muted rounded" />
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
