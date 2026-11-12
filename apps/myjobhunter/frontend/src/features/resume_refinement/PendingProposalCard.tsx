import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";
import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { showError, showSuccess } from "@platform/ui";
import { useRefinementProposal } from "@myjobhunter/api-client/hooks/useRefinementProposal";
import { IMPROVEMENT_SEVERITY_LABELS } from "@myjobhunter/api-client/constants/improvementSeverityLabels";
import { IMPROVEMENT_TYPE_LABELS } from "@myjobhunter/api-client/constants/improvementTypeLabels";
import { SuggestionMode } from "@myjobhunter/api-client/types/resume-refinement/suggestion-mode";
import { activeRefinementTarget } from "@myjobhunter/api-client/utils/activeRefinementTarget";
import SuggestionBody from "@/features/resume_refinement/SuggestionBody";
import SuggestionActions from "@/features/resume_refinement/SuggestionActions";
import SuggestionComposer from "@/features/resume_refinement/SuggestionComposer";
import CustomRewritePanel from "@/features/resume_refinement/CustomRewritePanel";
import SuggestionProgressBar from "@/features/resume_refinement/SuggestionProgressBar";
import NavigationButtons from "@/features/resume_refinement/NavigationButtons";
import { SEVERITY_BADGE_CLASS } from "@/features/resume_refinement/improvement-target-labels";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

interface PendingProposalCardProps {
  session: RefinementSession;
  /** Surface for the composer's optimistic echo — the parent renders
   *  it inside ConversationHistory (which lives outside this card). */
  onPendingEchoChange?: (echo: { text: string } | null) => void;
  /** A sibling mutation is in flight (click-to-target generation owned
   *  by ActiveSessionView) — folds into the unified pending gate. */
  externalPending?: boolean;
}

// Top-level orchestrator for the suggestion area. The state machine,
// mutations and optimistic echo live in useRefinementProposal (shared
// with the phone); all rendering is delegated to the sub-components in
// this directory.
export default function PendingProposalCard({
  session,
  onPendingEchoChange,
  externalPending = false,
}: PendingProposalCardProps) {
  const proposal = useRefinementProposal(session, {
    onSuccess: showSuccess,
    onError: (err) => showError(aiActionErrorMessage(err, "resumeRefinement")),
    externalPending,
  });
  const pendingEcho = proposal.pendingEcho;

  const echoCallbackRef = useRef(onPendingEchoChange);
  echoCallbackRef.current = onPendingEchoChange;
  useEffect(() => {
    echoCallbackRef.current?.(pendingEcho ? { text: pendingEcho } : null);
  }, [pendingEcho]);
  useEffect(() => {
    // Clear the parent's echo if this card unmounts mid-flight.
    return () => echoCallbackRef.current?.(null);
  }, []);

  const totalTargets = session.improvement_targets?.length ?? 0;
  const activeTarget = activeRefinementTarget(session);
  const clarifyingQuestion = session.pending_clarifying_question;
  const isPending = proposal.isPending;
  const isUserTarget = activeTarget?.origin === "user";

  // Bail when every target is consumed — AND for the zero-target
  // session, where there is nothing to suggest (CompletePanel's
  // "nothing to flag" state owns that render).
  if (session.target_index >= totalTargets) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header: "Suggestion N / M" + severity pill + Prev/Next */}
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-primary shrink-0" />
          <span className="truncate">
            Suggestion {session.target_index + 1} / {totalTargets}
          </span>
          {activeTarget && isUserTarget && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 bg-primary/10 text-primary">
              Your pick
            </span>
          )}
          {activeTarget && !isUserTarget && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${SEVERITY_BADGE_CLASS[activeTarget.severity]}`}
            >
              {IMPROVEMENT_SEVERITY_LABELS[activeTarget.severity]}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <NavigationButtons
            sessionId={session.id}
            targetIndex={session.target_index}
            totalTargets={totalTargets}
            isPending={isPending}
          />
        </div>
      </header>

      <SuggestionProgressBar
        completed={session.target_index}
        total={totalTargets}
      />

      {/* Improvement type pill as subtitle — suppressed for user-created
          targets, whose placeholder "other" type explains nothing next
          to the "Your pick" badge. */}
      {activeTarget && !isUserTarget && (
        <p className="text-xs">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
            {IMPROVEMENT_TYPE_LABELS[activeTarget.improvement_type]}
          </span>
        </p>
      )}

      {/* aria-live: focus never moves when a proposal lands (passive
          transitions by convention here) — this is the SR signal. */}
      <div aria-live="polite">
        <SuggestionBody
          clarifyingQuestion={clarifyingQuestion}
          proposal={session.pending_proposal}
          rationale={session.pending_rationale}
          isPending={isPending}
          isRegenerating={proposal.isRegenerating}
          canForce={session.guard_can_force}
          onForce={proposal.forceAccept}
          forceIsLoading={proposal.isForcing}
        />
      </div>

      {proposal.mode === SuggestionMode.VIEW && (
        <SuggestionActions
          onAccept={proposal.accept}
          onSwitchToCustom={proposal.openCustom}
          onSkip={proposal.skip}
          isPending={isPending}
          acceptIsLoading={proposal.isAccepting}
          hasProposal={!!session.pending_proposal}
        />
      )}
      {proposal.mode === SuggestionMode.CUSTOM && (
        <CustomRewritePanel
          customText={proposal.customText}
          onChange={proposal.setCustomText}
          onCancel={proposal.closeCustom}
          onSubmit={proposal.submitCustom}
          isPending={isPending}
        />
      )}

      {/* Always-visible chat input — hints, clarify answers, and
          rerolls all live here. Stably mounted (never keyed to the
          target) so focus survives sends. */}
      <SuggestionComposer
        value={proposal.composerText}
        onChange={proposal.setComposerText}
        onSend={proposal.send}
        onRegenerate={proposal.regenerate}
        isBusy={isPending}
        isClarify={!!clarifyingQuestion}
      />
    </section>
  );
}
