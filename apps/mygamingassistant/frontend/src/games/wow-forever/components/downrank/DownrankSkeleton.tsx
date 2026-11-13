import { DOWNRANK_SKELETON_ROWS } from "@/games/wow-forever/data/downrank/downrankConfig";

const BAR = "rounded bg-muted animate-pulse";
const FIELDS = 4;

/** Same shape as the loaded calculator: the inputs card, the suggestions, the formula note, then the ranks. */
export default function DownrankSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the calculator" data-testid="downrank-skeleton">
      <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-3" aria-hidden>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: FIELDS }, (_, i) => (
            <div key={i} className="space-y-1">
              <div className={`h-4 w-20 ${BAR}`} />
              <div className={`h-11 w-full ${BAR}`} />
            </div>
          ))}
        </div>
        <div className={`h-11 w-full ${BAR}`} />
      </div>
      <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-2" aria-hidden>
        <div className={`h-5 w-40 ${BAR}`} />
        <div className={`h-8 w-full ${BAR}`} />
      </div>
      <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-2" aria-hidden>
        <div className={`h-5 w-48 ${BAR}`} />
        <div className={`h-4 w-full ${BAR}`} />
        <div className={`h-4 w-3/4 ${BAR}`} />
      </div>
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: DOWNRANK_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="rounded-xl border bg-card p-3 space-y-2" data-testid="downrank-skeleton-row">
            <div className={`h-5 w-1/3 ${BAR}`} />
            <div className={`h-4 w-full ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
