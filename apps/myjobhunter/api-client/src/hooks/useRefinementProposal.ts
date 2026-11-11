import { useState } from "react";
import { REFINEMENT_TOASTS } from "../constants/refinementToasts";
import {
  useAcceptFlaggedMutation,
  useAcceptPendingMutation,
  useRequestAlternativeMutation,
  useSkipTargetMutation,
  useSupplyCustomRewriteMutation,
} from "../store/resumeRefinementApi";
import type { RefinementProposalControls } from "../types/resume-refinement/refinement-proposal-controls";
import type { RefinementProposalOptions } from "../types/resume-refinement/refinement-proposal-options";
import type { RefinementSession } from "../types/resume-refinement/refinement-session";
import { SuggestionMode } from "../types/resume-refinement/suggestion-mode";

/**
 * The suggestion card for the website and the phone: accept, accept what the fact guard held,
 * write my own, chat with the assistant, another take, skip. Each failure goes to `onError`, and
 * nothing typed is lost to one.
 */
export function useRefinementProposal(
  session: Pick<RefinementSession, "id" | "turn_count">,
  { onSuccess, onError, externalPending = false }: RefinementProposalOptions,
): RefinementProposalControls {
  const [mode, setMode] = useState<SuggestionMode>(SuggestionMode.VIEW);
  const [customText, setCustomText] = useState("");
  const [composerText, setComposerText] = useState("");
  // Set at send time with the turn count before it; cleared when the real turn rows arrive (the
  // count goes up), not when the request settles, which would flicker the bubble out before the
  // refetched history holds it.
  const [pendingEcho, setPendingEcho] = useState<{ text: string; baselineTurnCount: number } | null>(null);

  const [acceptPending, accept] = useAcceptPendingMutation();
  const [acceptFlagged, flaggedAccept] = useAcceptFlaggedMutation();
  const [supplyCustom, custom] = useSupplyCustomRewriteMutation();
  const [requestAlternative, alternative] = useRequestAlternativeMutation();
  const [skipTarget, skipping] = useSkipTargetMutation();

  // Cleared during render, in the same render the real turn arrives.
  if (pendingEcho && session.turn_count > pendingEcho.baselineTurnCount) {
    setPendingEcho(null);
  }

  const isPending =
    accept.isLoading || flaggedAccept.isLoading || custom.isLoading || alternative.isLoading || skipping.isLoading || externalPending;

  async function run(action: () => Promise<unknown>, after: () => void): Promise<void> {
    try {
      await action();
      after();
    } catch (error) {
      onError(error);
    }
  }

  return {
    mode,
    openCustom: () => setMode(SuggestionMode.CUSTOM),
    closeCustom: () => setMode(SuggestionMode.VIEW),
    customText,
    setCustomText,
    composerText,
    setComposerText,
    pendingEcho: pendingEcho?.text ?? null,
    isPending,
    isAccepting: accept.isLoading,
    isForcing: flaggedAccept.isLoading,
    isSubmittingCustom: custom.isLoading,
    isSkipping: skipping.isLoading,
    isRegenerating: alternative.isLoading || externalPending,
    accept: () =>
      run(
        () => acceptPending(session.id).unwrap(),
        () => {
          onSuccess(REFINEMENT_TOASTS.applied);
          setMode(SuggestionMode.VIEW);
        },
      ),
    // The backend records the confirmed phrases for the session, so the guard never flags them again.
    forceAccept: () =>
      run(
        () => acceptFlagged(session.id).unwrap(),
        () => {
          onSuccess(REFINEMENT_TOASTS.applied);
          setMode(SuggestionMode.VIEW);
          setComposerText("");
        },
      ),
    submitCustom: async () => {
      const text = customText.trim();
      if (!text) return;
      await run(
        () => supplyCustom({ id: session.id, user_text: text }).unwrap(),
        () => {
          onSuccess(REFINEMENT_TOASTS.customApplied);
          setMode(SuggestionMode.VIEW);
          setCustomText("");
        },
      );
    },
    // The input clears at once with an optimistic bubble; a failure puts the text back.
    send: async () => {
      const text = composerText.trim();
      if (!text) return;
      setComposerText("");
      setPendingEcho({ text, baselineTurnCount: session.turn_count });
      try {
        await requestAlternative({ id: session.id, hint: text }).unwrap();
      } catch (error) {
        setPendingEcho(null);
        setComposerText(text);
        onError(error);
      }
    },
    regenerate: () => run(() => requestAlternative({ id: session.id, hint: undefined }).unwrap(), () => undefined),
    skip: () => run(() => skipTarget(session.id).unwrap(), () => setMode(SuggestionMode.VIEW)),
  };
}
