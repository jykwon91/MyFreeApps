import { RARES_SKELETON_ROWS } from "@/games/wow-forever/data/rares/raresConfig";

const BAR = "rounded bg-muted animate-pulse";

/** Same shape as the loaded page: the filters card, the macro bar, a count, then rare cards (title, place, /target line, drops). */
export default function RaresSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading rares" data-testid="rares-skeleton">
      <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-hidden data-testid="rares-skeleton-filters">
        <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
          <div className={`h-[68px] ${BAR}`} />
          <div className={`h-[68px] ${BAR}`} />
          <div className={`h-[68px] ${BAR}`} />
        </div>
        <div className={`h-11 w-2/3 ${BAR}`} />
      </div>
      <div className={`h-[46px] rounded-xl border bg-card ${BAR}`} aria-hidden />
      <div className={`h-5 w-32 ${BAR}`} aria-hidden />
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: RARES_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="rares-skeleton-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className={`h-5 w-1/2 ${BAR}`} />
                <div className={`h-5 w-40 ${BAR}`} />
              </div>
              <div className={`h-6 w-28 ${BAR}`} />
            </div>
            <div className={`h-5 w-3/4 ${BAR}`} />
            <div className={`h-8 w-56 ${BAR}`} />
            <div className={`h-10 w-full ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
