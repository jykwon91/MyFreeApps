/**
 * Loading placeholder for the rate-watch check.
 *
 * Mirrors the loaded section: the verdict banner, the action-item box, the
 * scope line, three bordered policy cards each with a heading row, a headline
 * line, a projection line and two filing rows, then the market list with its
 * heading and five rows. Same shape means no layout shift when the department
 * answers.
 *
 * Three cards rather than two because every policy now gets one, and the
 * operator this was rebuilt for holds three.
 */
export default function RateWatchSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="rate-watch-loading"
    >
      {/* The verdict lands first and is the tallest single element; without a
          placeholder everything below it jumps on arrival. */}
      <div className="rounded-lg border border-border p-4">
        <div className="h-6 bg-muted rounded w-72" />
        <div className="h-3 bg-muted rounded w-56 mt-2" />
      </div>

      {/* The action item, then the scope line. Both sit between the verdict and
          the cards in the loaded section. */}
      <div className="rounded-lg border border-border p-4">
        <div className="h-4 bg-muted rounded w-24" />
        <div className="h-4 bg-muted rounded w-full mt-2" />
        <div className="h-3 bg-muted rounded w-64 mt-2" />
      </div>

      <div className="h-4 bg-muted rounded w-80" />

      <ul className="space-y-3">
        {[1, 2, 3].map((card) => (
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
