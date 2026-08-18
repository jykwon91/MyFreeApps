/**
 * Loading placeholder for the refinance check.
 *
 * Mirrors the loaded section: the verdict banner, the scope line, three
 * bordered loan cards each with a heading row, a headline line and an
 * eight-row figures grid, then the survey footnote. Same shape means no layout
 * shift when Freddie Mac answers.
 *
 * Three cards because the operator this was built for holds three loans, and
 * every loan gets a card whether or not it could be compared.
 */
export default function MortgageRateWatchSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="mortgage-rate-watch-loading"
    >
      <div className="rounded-lg border border-border p-4">
        <div className="h-6 bg-muted rounded w-72" />
        <div className="h-3 bg-muted rounded w-56 mt-2" />
      </div>

      <div className="h-4 bg-muted rounded w-80" />

      <ul className="space-y-3">
        {[1, 2, 3].map((card) => (
          <li key={card} className="rounded-lg border border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="h-4 bg-muted rounded w-48" />
              <div className="h-3 bg-muted rounded w-14" />
            </div>
            <div className="h-4 bg-muted rounded w-56 mt-2" />
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                <div key={row} className="contents">
                  <div className="h-4 w-40 bg-muted rounded" />
                  <div className="h-4 w-24 bg-muted rounded" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-4/5" />
    </div>
  );
}
