import { TRIAGE_LIST_SKELETON_ROWS } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_SKELETON_BAR } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";

/** All requests while it loads: the filter row and rows with a loaded row's two lines. */
export default function TriageListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading requests" data-testid="triage-list-skeleton" className="space-y-4">
      <div data-section="filters" className="space-y-2">
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-11 w-24 shrink-0 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
          ))}
        </div>
        <div className="flex gap-2">
          <div className={`h-11 flex-1 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
          <div className={`h-11 flex-1 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
        </div>
      </div>
      <ul className="space-y-2">
        {Array.from({ length: TRIAGE_LIST_SKELETON_ROWS }, (_, i) => (
          <li key={i} data-section="story-row" className="space-y-1.5 rounded-xl border bg-card p-3">
            <div data-row="title" className={`h-5 w-2/3 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
            <div data-row="meta" className={`h-4 w-1/2 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
          </li>
        ))}
      </ul>
    </div>
  );
}
