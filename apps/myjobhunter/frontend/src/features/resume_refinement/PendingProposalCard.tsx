import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Badge,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import {
  useAcceptPendingMutation,
  useSupplyCustomRewriteMutation,
  useRequestAlternativeMutation,
  useSkipTargetMutation,
} from "@/lib/resumeRefinementApi";
import { SuggestionMode } from "@/features/resume_refinement/suggestion-mode";
import CurrentTargetBlock from "@/features/resume_refinement/CurrentTargetBlock";
import SuggestionBody from "@/features/resume_refinement/SuggestionBody";
import SuggestionActions from "@/features/resume_refinement/SuggestionActions";
import CustomRewritePanel from "@/features/resume_refinement/CustomRewritePanel";
import AlternativePanel from "@/features/resume_refinement/AlternativePanel";
import TargetMetaBadges from "@/features/resume_refinement/TargetMetaBadges";
import SuggestionProgressBar from "@/features/resume_refinement/SuggestionProgressBar";
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
  const [supplyCustom, custom] = useSupplyCustomRewriteMutation();
  const [requestAlternative, alternative] = useRequestAlternativeMutation();
  const [skipTarget, skip] = useSkipTargetMutation();

  const totalTargets = session.improvement_targets?.length ?? 0;
  const remaining = Math.max(totalTargets - session.target_index, 0);
  const targetSection = session.pending_target_section;
  const activeTarget =
    session.improvement_targets && session.target_index < session.improvement_targets.length
      ? session.improvement_targets[session.target_index]
      : null;
  const currentText = activeTarget?.current_text ?? null;
  const proposal = session.pending_proposal;
  const rationale = session.pending_rationale;
  const clarifyingQuestion = session.pending_clarifying_question;
  const isPending =
    accept.isLoading || custom.isLoading || alternative.isLoading || skip.isLoading;

  if (totalTargets > 0 && session.target_index >= totalTargets) {
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
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Suggestion {session.target_index + 1} of {totalTargets}
        </h2>
        <Badge label={`${remaining} left`} color="gray" />
      </header>

      <SuggestionProgressBar
        completed={session.target_index}
        total={totalTargets}
      />

      {targetSection && (
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Section: <span className="font-medium normal-case">{targetSection}</span>
        </p>
      )}

      {activeTarget && (
        <TargetMetaBadges
          improvementType={activeTarget.improvement_type}
          severity={activeTarget.severity}
          notes={activeTarget.notes}
        />
      )}

      {currentText && <CurrentTargetBlock text={currentText} />}

      <SuggestionBody
        clarifyingQuestion={clarifyingQuestion}
        customText={customText}
        onCustomTextChange={setCustomText}
        onClarifySubmit={handleCustom}
        proposal={proposal}
        rationale={rationale}
        isPending={isPending}
      />

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
    </section>
  );
}
