import { BOARD_SKELETON_CARDS } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";

const BAR = "rounded-md bg-muted motion-safe:animate-pulse";

/**
 * The board while it first loads: the filter row and four cards with the same rows as a loaded card
 * (chips, title, story, count + "Me too"), so nothing jumps when the stories arrive.
 */
export default function FeatureRequestListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading ideas" data-testid="feature-request-skeleton" className="space-y-4">
      <div className="space-y-2" data-section="filters">
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`h-11 w-24 shrink-0 ${BAR}`} aria-hidden />
          ))}
        </div>
        <div className="flex gap-2">
          <div className={`h-11 flex-1 ${BAR}`} aria-hidden />
          <div className={`h-11 w-40 ${BAR}`} aria-hidden />
        </div>
      </div>
      <ul className="space-y-3">
        {Array.from({ length: BOARD_SKELETON_CARDS }, (_, i) => (
          <li key={i} data-section="card" className="space-y-2 rounded-xl border bg-card p-4">
            <div data-row="chips" className="flex gap-1.5">
              <div className={`h-5 w-16 ${BAR}`} aria-hidden />
              <div className={`h-5 w-32 ${BAR}`} aria-hidden />
            </div>
            <div data-row="title" className={`h-5 w-3/4 ${BAR}`} aria-hidden />
            <div data-row="story" className="space-y-1.5">
              <div className={`h-4 w-full ${BAR}`} aria-hidden />
              <div className={`h-4 w-5/6 ${BAR}`} aria-hidden />
            </div>
            <div data-row="votes" className="flex items-center justify-between pt-1">
              <div className={`h-4 w-28 ${BAR}`} aria-hidden />
              <div className={`h-11 w-24 rounded-full ${BAR}`} aria-hidden />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
