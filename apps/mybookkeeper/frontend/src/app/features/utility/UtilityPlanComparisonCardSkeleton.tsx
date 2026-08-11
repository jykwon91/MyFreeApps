/**
 * Loading placeholder for the dashboard rate-comparison card.
 *
 * Mirrors the loaded card's chrome exactly — ``p-0`` shell, a bordered header
 * bar carrying the heading and the "View all" link, then two rows each with a
 * two-line left block and a gap pill on the right. The dashboard's own skeleton
 * renders this same component rather than re-describing it, so the two cannot
 * drift apart and then both drift from the card they stand in for.
 */
export default function UtilityPlanComparisonCardSkeleton() {
  return (
    <div
      className="bg-card border rounded-lg p-0 overflow-hidden animate-pulse"
      aria-busy="true"
      data-testid="utility-plan-comparison-card-loading"
    >
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b">
        <div className="h-5 bg-muted rounded w-56" />
        <div className="h-4 bg-muted rounded w-16 shrink-0" />
      </div>
      <div className="px-6 py-2">
        <ul className="divide-y">
          {[1, 2].map((i) => (
            <li key={i} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
              <div className="h-5 w-28 bg-muted rounded-full shrink-0" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
