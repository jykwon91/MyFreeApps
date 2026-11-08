import { RACES_SKELETON_CARDS, RACES_SKELETON_RACIALS } from "@/games/wow-forever/data/races/racesConfig";

const BAR = "rounded bg-muted/40 animate-pulse";

/** Same shape as the loaded page: the filters card, a count, then race cards (title, zone, classes, racial rows). */
export default function RacesSkeleton({ filters }: { filters: boolean }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading races" data-testid="races-skeleton">
      {filters ? (
        <div className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-hidden data-testid="races-skeleton-filters">
          <div className={`h-11 w-1/2 ${BAR}`} />
          <div className={`h-11 w-full ${BAR}`} />
          <div className={`h-[68px] w-48 ${BAR}`} />
        </div>
      ) : null}
      <div className={`h-5 w-40 ${BAR}`} aria-hidden />
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: filters ? RACES_SKELETON_CARDS : 1 }, (_, i) => (
          <li key={i} className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-testid="races-skeleton-card">
            <div className={`h-6 w-1/3 ${BAR}`} />
            <div className={`h-5 w-1/2 ${BAR}`} />
            <div className={`h-6 w-2/3 ${BAR}`} />
            {Array.from({ length: RACES_SKELETON_RACIALS }, (_, j) => (
              <div key={j} className="flex gap-3">
                <div className={`h-8 w-8 shrink-0 ${BAR}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-5 w-1/3 ${BAR}`} />
                  <div className={`h-10 w-full ${BAR}`} />
                </div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
