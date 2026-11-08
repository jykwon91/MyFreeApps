import { LEGACY_SKELETON_NODES } from "@/games/wow-forever/data/legacy/legacyConfig";

const BAR = "rounded bg-muted/40 animate-pulse";
const TREES = 3;

/** Same shape as the loaded page: the summary strip, the planner (tabs + three trees), the challenges and the rewards. */
export default function LegacySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading the Legacy planner" data-testid="legacy-skeleton">
      <div className="grid gap-2 sm:grid-cols-3" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-3">
            <div className={`h-4 w-24 ${BAR}`} />
            <div className={`h-7 w-32 ${BAR}`} />
            <div className={`h-5 w-20 ${BAR}`} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2" aria-hidden>
        <div className={`h-7 w-64 ${BAR}`} />
        <div className={`h-11 w-48 ${BAR}`} />
      </div>
      <div className={`h-11 w-full lg:hidden ${BAR}`} aria-hidden />
      <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: TREES }, (_, t) => (
          <div key={t} className={`rounded-xl border bg-card p-3 ${t > 0 ? "hidden lg:block" : ""}`} data-testid="legacy-skeleton-tree">
            <div className={`h-6 w-32 ${BAR}`} />
            <div className="mt-3 grid grid-cols-4 gap-y-6 py-3">
              {Array.from({ length: LEGACY_SKELETON_NODES }, (_, i) => (
                <div key={i} className={`mx-auto h-16 w-16 ${BAR}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2" aria-hidden>
        <div className={`h-7 w-56 ${BAR}`} />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`h-11 w-full ${BAR}`} />
        ))}
      </div>
      <div className="space-y-2" aria-hidden>
        <div className={`h-7 w-48 ${BAR}`} />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-16 w-full ${BAR}`} />
        ))}
      </div>
    </div>
  );
}
