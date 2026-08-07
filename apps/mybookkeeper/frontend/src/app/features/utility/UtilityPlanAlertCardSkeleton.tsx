/**
 * Loading placeholder for the dashboard renewal card.
 *
 * Mirrors the loaded card exactly — same Card chrome, a heading line, and two
 * rows each with a two-line left block and a badge on the right — so the
 * dashboard does not shift when the alerts land.
 */
export default function UtilityPlanAlertCardSkeleton() {
  return (
    <div
      className="bg-card border rounded-lg p-6 animate-pulse"
      aria-busy="true"
      data-testid="utility-plan-alert-card-loading"
    >
      <div className="h-5 bg-muted rounded w-48 mb-4" />
      <ul className="divide-y">
        {[1, 2].map((i) => (
          <li key={i} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-3 bg-muted rounded w-2/3" />
            </div>
            <div className="h-5 w-20 bg-muted rounded-full shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
