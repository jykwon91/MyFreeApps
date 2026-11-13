import { CHANGE_SKELETON_ROWS } from "@/games/wow-forever/data/changes/changeFeedConfig";

const BAR = "rounded bg-muted animate-pulse";

/** Same shape as the loaded feed: a result count, then cards with an icon, name, chips, a summary and two lines of old / new. */
export default function ChangeFeedSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading changes" data-testid="change-skeleton">
      <div className={`h-5 w-40 ${BAR}`} aria-hidden />
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: CHANGE_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" data-testid="change-skeleton-card">
            <div className="flex items-start gap-3">
              <div className={`h-8 w-8 shrink-0 ${BAR}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-5 w-1/2 ${BAR}`} />
                <div className={`h-5 w-24 ${BAR}`} />
              </div>
            </div>
            <div className={`h-4 w-3/4 ${BAR}`} />
            <div className={`h-4 w-full ${BAR}`} />
            <div className={`h-4 w-full ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
