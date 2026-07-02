import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import {
  useAcceptPendingMutation,
  useAcceptFlaggedMutation,
  useSupplyCustomRewriteMutation,
  useRequestAlternativeMutation,
  useSkipTargetMutation,
} from "@/lib/resumeRefinementApi";
import { SuggestionMode } from "@/features/resume_refinement/suggestion-mode";
import SuggestionBody from "@/features/resume_refinement/SuggestionBody";
import SuggestionActions from "@/features/resume_refinement/SuggestionActions";
import SuggestionComposer from "@/features/resume_refinement/SuggestionComposer";
import CustomRewritePanel from "@/features/resume_refinement/CustomRewritePanel";
import SuggestionProgressBar from "@/features/resume_refinement/SuggestionProgressBar";
import NavigationButtons from "@/features/resume_refinement/NavigationButtons";
import {
  IMPROVEMENT_TYPE_LABEL,
  SEVERITY_BADGE_CLASS,
  SEVERITY_LABEL,
} from "@/features/resume_refinement/improvement-target-labels";
import type { RefinementSession } from "@/types/resume-refinement/refinement-session";

interface PendingProposalCardProps {
  session: RefinementSession;
  /** Surface for the composer's optimistic echo — the parent renders
   *  it inside ConversationHistory (which lives outside this card). */
  onPendingEchoChange?: (echo: { text: string } | null) => void;
}

// Top-level orchestrator for the suggestion area. Owns the
// SuggestionMode state machine, the mutation hooks, and the
// always-visible chat composer; all rendering is delegated to the
// sub-components in this directory.
export default function PendingProposalCard({
  session,
  onPendingEchoChange,
}: PendingProposalCardProps) {
  const [mode, setMode] = useState<SuggestionMode>(SuggestionMode.VIEW);
  // Dedicated states: customText belongs to "Write my own" (replaces
  // the target outright); composerText is chat (hints + clarify
  // answers). They can be visible simultaneously — sharing one string
  // would cross-contaminate the two inputs.
  const [customText, setCustomText] = useState("");
  const [composerText, setComposerText] = useState("");
  // Optimistic echo: set at send time with the pre-send turn_count;
  // cleared when the REAL turn rows arrive (turn_count advances) — not
  // on promise resolution, which would flicker the bubble out before
  // the refetched history contains it.
  const [pendingEcho, setPendingEcho] = useState<
    { text: string; baselineTurnCount: number } | null
  >(null);

  const [acceptPending, accept] = useAcceptPendingMutation();
  const [acceptFlagged, flaggedAccept] = useAcceptFlaggedMutation();
  const [supplyCustom, custom] = useSupplyCustomRewriteMutation();
  const [requestAlternative, alternative] = useRequestAlternativeMutation();
  const [skipTarget, skip] = useSkipTargetMutation();

  useEffect(() => {
    if (pendingEcho && session.turn_count > pendingEcho.baselineTurnCount) {
      setPendingEcho(null);
    }
  }, [session.turn_count, pendingEcho]);

  const echoCallbackRef = useRef(onPendingEchoChange);
  echoCallbackRef.current = onPendingEchoChange;
  useEffect(() => {
    echoCallbackRef.current?.(pendingEcho ? { text: pendingEcho.text } : null);
  }, [pendingEcho]);
  useEffect(() => {
    // Clear the parent's echo if this card unmounts mid-flight.
    return () => echoCallbackRef.current?.(null);
  }, []);

  const totalTargets = session.improvement_targets?.length ?? 0;
  const activeTarget =
    session.improvement_targets && session.target_index < session.improvement_targets.length
      ? session.improvement_targets[session.target_index]
      : null;
  const proposal = session.pending_proposal;
  const rationale = session.pending_rationale;
  const clarifyingQuestion = session.pending_clarifying_question;
  const isPending =
    accept.isLoading ||
    flaggedAccept.isLoading ||
    custom.isLoading ||
    alternative.isLoading ||
    skip.isLoading;

  // Bail when every target is consumed — AND for the zero-target
  // session, where there is nothing to suggest (CompletePanel's
  // "nothing to flag" state owns that render).
  if (session.target_index >= totalTargets) {
    return null;
  }

  function resetMode() {
    setMode(SuggestionMode.VIEW);
  }

  async function handleAccept() {
    try {
      await acceptPending(session.id).unwrap();
      showSuccess("Applied. Onto the next one.");
      resetMode();
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  // Guard loop breaker: the user explicitly confirms the flagged facts
  // are accurate and applies the held proposal as-is. The backend
  // records the phrases as session-level confirmed facts so the guard
  // never re-flags them.
  async function handleForceAccept() {
    try {
      await acceptFlagged(session.id).unwrap();
      showSuccess("Applied. Onto the next one.");
      resetMode();
      setComposerText("");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleCustom() {
    if (!customText.trim()) return;
    try {
      await supplyCustom({ id: session.id, user_text: customText.trim() }).unwrap();
      showSuccess("Your rewrite is in.");
      resetMode();
      setCustomText("");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  // One send path for everything typed into the composer: style hints,
  // clarify answers, redirections. Clears the input IMMEDIATELY and
  // shows an optimistic bubble; on error the text is restored so
  // nothing the user typed is lost.
  async function handleComposerSend() {
    const text = composerText.trim();
    if (!text) return;
    setComposerText("");
    setPendingEcho({ text, baselineTurnCount: session.turn_count });
    try {
      await requestAlternative({ id: session.id, hint: text }).unwrap();
    } catch (err) {
      setPendingEcho(null);
      setComposerText(text);
      showError(extractErrorMessage(err));
    }
  }

  // Blank reroll (old "Another option") — regenerate without a note.
  async function handleRegenerate() {
    try {
      await requestAlternative({ id: session.id, hint: undefined }).unwrap();
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleSkip() {
    try {
      await skipTarget(session.id).unwrap();
      resetMode();
    } catch (err) {
      showError(extractErrorMessage(err));
    }
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
          {activeTarget && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${SEVERITY_BADGE_CLASS[activeTarget.severity]}`}
            >
              {SEVERITY_LABEL[activeTarget.severity]}
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

      {/* Improvement type pill as subtitle */}
      {activeTarget && (
        <p className="text-xs">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
            {IMPROVEMENT_TYPE_LABEL[activeTarget.improvement_type]}
          </span>
        </p>
      )}

      <SuggestionBody
        clarifyingQuestion={clarifyingQuestion}
        proposal={proposal}
        rationale={rationale}
        isPending={isPending}
        isRegenerating={alternative.isLoading}
        canForce={session.guard_can_force}
        onForce={handleForceAccept}
        forceIsLoading={flaggedAccept.isLoading}
      />

      {mode === SuggestionMode.VIEW && (
        <SuggestionActions
          onAccept={handleAccept}
          onSwitchToCustom={() => setMode(SuggestionMode.CUSTOM)}
          onSkip={handleSkip}
          isPending={isPending}
          acceptIsLoading={accept.isLoading}
          hasProposal={!!proposal}
        />
      )}
      {mode === SuggestionMode.CUSTOM && (
        <CustomRewritePanel
          customText={customText}
          onChange={setCustomText}
          onCancel={resetMode}
          onSubmit={handleCustom}
          isPending={isPending}
        />
      )}

      {/* Always-visible chat input — hints, clarify answers, and
          rerolls all live here. Stably mounted (never keyed to the
          target) so focus survives sends. */}
      <SuggestionComposer
        value={composerText}
        onChange={setComposerText}
        onSend={handleComposerSend}
        onRegenerate={handleRegenerate}
        isBusy={isPending}
        isClarify={!!clarifyingQuestion}
      />
    </section>
  );
}
