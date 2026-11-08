import { LIBRARY_SKELETON_ROWS } from "@/games/wow-forever/data/library/libraryConfig";

const BAR = "rounded bg-muted/40 animate-pulse";

/** Same shape as the loaded page: the rewards card, the cards card, the filters, a count, then book cards. */
export default function LibrarySkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading library books" data-testid="library-skeleton">
      <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-hidden>
        <div className={`h-6 w-40 ${BAR}`} />
        <div className={`h-5 w-2/3 ${BAR}`} />
        <div className={`h-5 w-1/2 ${BAR}`} />
        <div className={`h-11 w-full ${BAR}`} />
        <div className={`h-11 w-full ${BAR}`} />
      </div>
      <div className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" aria-hidden>
        <div className={`h-6 w-32 ${BAR}`} />
        <div className={`h-11 w-2/3 ${BAR}`} />
        <div className={`h-11 w-2/3 ${BAR}`} />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-hidden>
        <div className={`h-[68px] ${BAR}`} />
        <div className={`h-11 w-3/4 ${BAR}`} />
        <div className={`h-11 w-32 ${BAR}`} />
      </div>
      <div className={`h-5 w-40 ${BAR}`} aria-hidden />
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: LIBRARY_SKELETON_ROWS }, (_, i) => (
          <li key={i} className="space-y-2 rounded-xl border bg-card p-3 sm:p-4" data-testid="library-skeleton-card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 gap-3">
                <div className={`h-8 w-8 ${BAR}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-5 w-2/3 ${BAR}`} />
                  <div className={`h-5 w-40 ${BAR}`} />
                </div>
              </div>
              <div className={`h-6 w-20 ${BAR}`} />
            </div>
            <div className={`h-5 w-full ${BAR}`} />
            <div className={`h-5 w-48 ${BAR}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
