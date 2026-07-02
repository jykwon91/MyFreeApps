import { useState } from "react";
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
import CustomRewritePanel from "@/features/resume_refinement/CustomRewritePanel";
import AlternativePanel from "@/features/resume_refinement/AlternativePanel";
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
}

// Top-level orchestrator for the suggestion area. Owns the
// SuggestionMode state machine and the four mutation hooks; all
// rendering is delegated to the sub-components in this directory.
export default function PendingProposalCard({ session }: PendingProposalCardProps) {
  const [mode, setMode] = useState<SuggestionMode>(SuggestionMode.VIEW);
  const [customText, setCustomText] = useState("");
  const [hint, setHint] = useState("");

  const [acceptPending, accept] = useAcceptPendingMutation();
  const [acceptFlagged, flaggedAccept] = useAcceptFlaggedMutation();
  const [supplyCustom, custom] = useSupplyCustomRewriteMutation();
  const [requestAlternative, alternative] = useRequestAlternativeMutation();
  const [skipTarget, skip] = useSkipTargetMutation();

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
  // "nothing to flag" state owns that render). The old
  // `totalTargets > 0 &&` clause inverted the zero case and showed a
  // permanently-thinking "Suggestion 1 / 0" card.
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

  // Distinct from handleCustom: when Claude asked a clarifying question,
  // the operator's typed answer is CONTEXT for Claude to compose a
  // better proposal — not the rewrite itself. Pipe it through
  // request_alternative as the ``hint`` so the regenerated proposal
  // reflects the answer. The cache for the current target is
  // invalidated server-side, so the new proposal lands fresh.
  async function handleClarifySubmit() {
    if (!customText.trim()) return;
    try {
      await requestAlternative({
        id: session.id,
        hint: customText.trim(),
      }).unwrap();
      showSuccess("Got it — composing a suggestion with your context.");
      resetMode();
      setCustomText("");
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
      setCustomText("");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleAlternative() {
    try {
      await requestAlternative({
        id: session.id,
        hint: hint.trim() || undefined,
      }).unwrap();
      resetMode();
      setHint("");
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
        customText={customText}
        onCustomTextChange={setCustomText}
        onClarifySubmit={handleClarifySubmit}
        proposal={proposal}
        rationale={rationale}
        isPending={isPending}
        isRegenerating={alternative.isLoading}
        canForce={session.guard_can_force}
        onForce={handleForceAccept}
        forceIsLoading={flaggedAccept.isLoading}
      />

      {/* Exactly one of the three action panels — mutually exclusive via mode state */}
      {mode === SuggestionMode.VIEW && (
        <SuggestionActions
          onAccept={handleAccept}
          onSwitchToCustom={() => setMode(SuggestionMode.CUSTOM)}
          onSwitchToAlternative={() => setMode(SuggestionMode.ALTERNATIVE)}
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
      {mode === SuggestionMode.ALTERNATIVE && (
        <AlternativePanel
          hint={hint}
          onChange={setHint}
          onCancel={resetMode}
          onSubmit={handleAlternative}
          isPending={isPending}
        />
      )}
    </section>
  );
}
