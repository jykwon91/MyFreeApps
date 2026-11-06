import { TRIAGE_INBOX_SKELETON_CARDS } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_SKELETON_BAR } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";

/** The inbox while it loads: the headline and two cards with a loaded card's rows. Never "Loading…". */
export default function TriageInboxSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the inbox" data-testid="triage-inbox-skeleton" className="space-y-4">
      <div className={`h-7 w-56 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
      {Array.from({ length: TRIAGE_INBOX_SKELETON_CARDS }, (_, i) => (
        <div key={i} data-section="inbox-card" className="space-y-4 rounded-xl border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div data-row="meta" className="flex gap-2">
                <div className={`h-5 w-20 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
                <div className={`h-5 w-16 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
              </div>
              <div data-row="quote" className={`h-24 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
            </div>
            <div className="space-y-3">
              <div data-row="story" className="space-y-2">
                <div className={`h-5 w-3/4 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
                <div className={`h-4 w-full ${TRIAGE_SKELETON_BAR}`} aria-hidden />
                <div className={`h-4 w-5/6 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
              </div>
              <div data-row="private" className="flex gap-3">
                <div className={`h-11 w-48 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
                <div className={`h-11 flex-1 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
              </div>
            </div>
          </div>
          <div data-row="actions" className="flex flex-col gap-2 sm:flex-row">
            <div className={`h-11 w-full sm:w-28 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
            <div className={`h-11 w-48 ${TRIAGE_SKELETON_BAR}`} aria-hidden />
          </div>
        </div>
      ))}
    </div>
  );
}
