/**
 * Loading placeholder for the better-plans search.
 *
 * Mirrors the loaded section: two bordered property cards, each with a heading,
 * a current-plan line, and three offer rows carrying a three-line left block
 * and a saving pill on the right. Same shape means no layout shift when the
 * feed answers.
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
          <div className="h-3 bg-muted rounded w-64 mt-2" />
          <ul className="mt-2">
            {[1, 2, 3].map((row) => (
              <li
                key={row}
                className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
                <div className="h-5 w-20 bg-muted rounded-full shrink-0" />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
