const STAT_TILES = 3;
const STOP_CARDS = 3;
const CRAFT_ROWS = 4;

/** The plan's shape while its data loads: the three totals, a trip of stop cards with its crafting, and the shopping list. */
export default function GoalPlanSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden data-testid="goal-plan-skeleton">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: STAT_TILES }, (_, i) => (
          <div key={i} className="h-[84px] rounded-lg border bg-card" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
        <ol className="space-y-2">
          {Array.from({ length: STOP_CARDS }, (_, i) => (
            <li key={i} className="h-[148px] rounded-lg border bg-card" />
          ))}
        </ol>
        <div className="space-y-2 rounded-lg border bg-card px-3 py-2">
          <div className="h-4 w-20 rounded bg-muted" />
          {Array.from({ length: CRAFT_ROWS }, (_, i) => (
            <div key={i} className="h-9 rounded bg-muted" />
          ))}
        </div>
      </div>
      <div className="h-[60px] rounded-lg border bg-card" />
    </div>
  );
}
