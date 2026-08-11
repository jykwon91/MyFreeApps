/**
 * Loading placeholder for the better-plans search.
 *
 * Mirrors the loaded section: two bordered property cards, each with a heading,
 * a current-plan rail on the left, and three candidate cards on the right
 * carrying a title row, a saving headline with its magnitude bar, and a
 * five-column stat grid. Same shape means no layout shift when the feed answers.
 */
export default function BetterPlansSkeleton() {
  return (
    <div
      className="space-y-4 animate-pulse"
      aria-busy="true"
      data-testid="better-plans-loading"
    >
      {[1, 2].map((group) => (
        <section key={group} className="rounded-lg border border-border p-4">
          <div className="h-4 bg-muted rounded w-40" />

          <div className="mt-3 lg:flex lg:gap-4 lg:items-start">
            <div className="lg:w-60 lg:shrink-0">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="h-3 bg-muted rounded w-24" />
                <div className="h-4 bg-muted rounded w-32 mt-2" />
                <div className="mt-3 grid grid-cols-3 lg:grid-cols-1 gap-x-4 gap-y-3">
                  {[1, 2, 3].map((figure) => (
                    <div key={figure} className="space-y-1.5">
                      <div className="h-3 bg-muted rounded w-16" />
                      <div className="h-4 bg-muted rounded w-20" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <ul className="flex-1 min-w-0 mt-3 lg:mt-0 space-y-3">
              {[1, 2, 3].map((row) => (
                <li key={row} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="h-5 w-20 bg-muted rounded-full shrink-0" />
                  </div>
                  <div className="h-7 bg-muted rounded w-28 mt-2" />
                  <div className="h-1.5 bg-muted rounded-full mt-1.5" />
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-3">
                    {[1, 2, 3, 4, 5].map((stat) => (
                      <div key={stat} className="space-y-1.5">
                        <div className="h-3 bg-muted rounded w-14" />
                        <div className="h-4 bg-muted rounded w-16" />
                      </div>
                    ))}
                  </div>
                  <div className="h-11 bg-muted rounded-md w-48 mt-3" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
