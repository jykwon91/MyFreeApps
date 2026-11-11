import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";
import { useEffect, useRef, useState } from "react";
import { showError } from "@platform/ui";
import CurrentDraftPanel from "@/features/resume_refinement/CurrentDraftPanel";
import PendingProposalCard from "@/features/resume_refinement/PendingProposalCard";
import CompletePanel from "@/features/resume_refinement/CompletePanel";
import SessionPreparingPanel from "@/features/resume_refinement/SessionPreparingPanel";
import ConversationHistory from "@/features/resume_refinement/ConversationHistory";
import ActiveSessionLayout from "@/features/resume_refinement/ActiveSessionLayout";
import ResumeRefinementHeader from "@/features/resume_refinement/ResumeRefinementHeader";
import { useDraftLinePicker } from "@myjobhunter/api-client/hooks/useDraftLinePicker";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

interface ActiveSessionViewProps {
  session: RefinementSession;
  onStartNew: () => void;
}

export default function ActiveSessionView({ session, onStartNew }: ActiveSessionViewProps) {
  // One-time fade on the composer zone when the background preparation
  // unlocks the session (preparing → active). Passive transition — no
  // focus is moved; the aria-live heading in SessionPreparingPanel and
  // the fade are the only signals.
  const prevStatusRef = useRef(session.status);
  const [justUnlocked, setJustUnlocked] = useState(false);
  useEffect(() => {
    if (prevStatusRef.current === "preparing" && session.status === "active") {
      setJustUnlocked(true);
    }
    prevStatusRef.current = session.status;
  }, [session.status]);

  const isPreparing = session.status === "preparing" || session.status === "failed";
  const showWorkSurface = session.status === "active" || session.status === "completed";

  // Optimistic echo of a just-sent composer message. Owned here
  // because the composer lives in PendingProposalCard (composer zone)
  // while the bubbles render in ConversationHistory (history zone).
  const [pendingEcho, setPendingEcho] = useState<{ text: string } | null>(null);

  // Click-to-target: the clicked line becomes the highlight IMMEDIATELY
  // (before the 2-10s generation resolves); the override clears once
  // the refetched session's active target matches the clicked line.
  const picker = useDraftLinePicker(session, (err) =>
    showError(aiActionErrorMessage(err, "resumeRefinement")),
  );
  const controlsRef = useRef<HTMLDivElement | null>(null);

  async function handleLineSelected(line: { text: string; section: string }) {
    // On narrow viewports the suggestion card sits below the draft —
    // bring it into view so the generated proposal isn't off-screen.
    if ((await picker.pick(line)) && window.innerWidth < 1024) {
      controlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const highlightText = picker.highlightText;

  const draft = (
    <CurrentDraftPanel
      markdown={session.current_draft}
      highlightText={highlightText}
      onLineClick={session.status === "active" ? handleLineSelected : undefined}
      clickDisabled={picker.isPicking}
    />
  );

  // RIGHT COLUMN: split into two zones.
  //
  // HISTORY ZONE — grows to fill available space, independently
  // scrollable on desktop. On mobile (<lg) rendered SECOND in DOM
  // order (order-2) so the composer stays visible above it.
  //
  // COMPOSER ZONE — shrinks to its natural height; never scrolls.
  // On desktop (lg+) rendered second in visual flow (order-2).
  // On mobile rendered first (order-1).
  const controls = (
    <div className="flex flex-col gap-2 min-h-0 h-full" ref={controlsRef}>
      {/* History zone */}
      <div className="order-2 lg:order-1 lg:flex-1 lg:overflow-y-auto lg:min-h-0 pr-1">
        <ConversationHistory
          turns={session.turns ?? []}
          pendingUserEcho={pendingEcho}
        />
      </div>

      {/* Composer zone */}
      <div
        className={`order-1 lg:order-2 shrink-0 ${justUnlocked ? "unlock-fade-in" : ""}`}
      >
        {isPreparing && <SessionPreparingPanel session={session} />}
        {session.status === "active" && (
          <PendingProposalCard
            session={session}
            onPendingEchoChange={setPendingEcho}
            externalPending={picker.isPicking}
          />
        )}
        {/* Gated: CompletePanel's reached-end math treats a null
            targets list as "done", so rendering it while preparing
            would show "Mark resume done" before the critique ran. */}
        {showWorkSurface && <CompletePanel session={session} />}
      </div>
    </div>
  );

  return (
    <ActiveSessionLayout
      header={
        <ResumeRefinementHeader
          compact
          onStartNew={onStartNew}
          startNewLabel={
            session.status === "preparing" ? "Cancel" : undefined
          }
        />
      }
      draft={draft}
      controls={controls}
    />
  );
}
