import { useState } from "react";
import { Sparkles, Pencil, RefreshCw, SkipForward } from "lucide-react";
import {
  Badge,
  LoadingButton,
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
import type { RefinementSession } from "@/types/resume-refinement/refinement-session";

interface PendingProposalCardProps {
  session: RefinementSession;
}

export default function PendingProposalCard({ session }: PendingProposalCardProps) {
  const [mode, setMode] = useState<"view" | "custom" | "alternative">("view");
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
  const isPending = accept.isLoading || custom.isLoading || alternative.isLoading || skip.isLoading;

  if (totalTargets > 0 && session.target_index >= totalTargets) {
    return null;
  }

  async function handleAccept() {
    try {
      await acceptPending(session.id).unwrap();
      showSuccess("Applied. Onto the next one.");
      setMode("view");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleCustom() {
    if (!customText.trim()) return;
    try {
      await supplyCustom({ id: session.id, user_text: customText.trim() }).unwrap();
      showSuccess("Your rewrite is in.");
      setMode("view");
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
      setMode("view");
      setHint("");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  async function handleSkip() {
    try {
      await skipTarget(session.id).unwrap();
      setMode("view");
    } catch (err) {
      showError(extractErrorMessage(err));
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          Suggestion
        </h2>
        <Badge
          label={`${session.target_index + 1} / ${totalTargets} · ${remaining} left`}
          color="gray"
        />
      </header>

      {targetSection && (
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Section: <span className="font-medium normal-case">{targetSection}</span>
        </p>
      )}

      {currentText && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wide text-amber-900/70 dark:text-amber-200/70 font-semibold mb-1">
            Currently
          </p>
          <p className="text-sm whitespace-pre-wrap">{currentText}</p>
        </div>
      )}

      {clarifyingQuestion ? (
        <ClarifyingPanel
          question={clarifyingQuestion}
          customText={customText}
          onCustomTextChange={setCustomText}
          onSubmit={handleCustom}
          isPending={isPending}
        />
      ) : proposal ? (
        <div className="rounded-md border border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-500/10 p-3">
          <p className="text-[11px] uppercase tracking-wide text-emerald-900/70 dark:text-emerald-200/70 font-semibold mb-1">
            Proposed rewrite
          </p>
          <p className="text-sm whitespace-pre-wrap">{proposal}</p>
          {rationale && (
            <p className="text-xs text-muted-foreground italic mt-2">{rationale}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Hmm, let me think. Working on a suggestion…
        </p>
      )}

      {mode === "custom" && (
        <CustomRewritePanel
          customText={customText}
          onChange={setCustomText}
          onCancel={() => setMode("view")}
          onSubmit={handleCustom}
          isPending={isPending}
        />
      )}

      {mode === "alternative" && (
        <AlternativePanel
          hint={hint}
          onChange={setHint}
          onCancel={() => setMode("view")}
          onSubmit={handleAlternative}
          isPending={isPending}
        />
      )}

      {mode === "view" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <LoadingButton
            onClick={handleAccept}
            isLoading={accept.isLoading}
            disabled={!proposal || isPending}
          >
            Accept
          </LoadingButton>
          <button
            type="button"
            onClick={() => setMode("custom")}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <Pencil size={14} /> Write my own
          </button>
          <button
            type="button"
            onClick={() => setMode("alternative")}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} /> Another option
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 ml-auto"
          >
            <SkipForward size={14} /> Skip
          </button>
        </div>
      )}
    </section>
  );
}

interface ClarifyingPanelProps {
  question: string;
  customText: string;
  onCustomTextChange: (s: string) => void;
  onSubmit: () => void;
  isPending: boolean;
}

function ClarifyingPanel({ question, customText, onCustomTextChange, onSubmit, isPending }: ClarifyingPanelProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
        {question}
      </div>
      <textarea
        value={customText}
        onChange={(e) => onCustomTextChange(e.target.value)}
        rows={3}
        placeholder="Your answer or your own rewrite…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex justify-end">
        <LoadingButton
          isLoading={isPending}
          onClick={onSubmit}
          disabled={!customText.trim()}
        >
          Use this
        </LoadingButton>
      </div>
    </div>
  );
}

interface CustomRewritePanelProps {
  customText: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function CustomRewritePanel({ customText, onChange, onCancel, onSubmit, isPending }: CustomRewritePanelProps) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <textarea
        value={customText}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Type the version you want…"
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <LoadingButton
          isLoading={isPending}
          onClick={onSubmit}
          disabled={!customText.trim()}
        >
          Use my version
        </LoadingButton>
      </div>
    </div>
  );
}

interface AlternativePanelProps {
  hint: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  isPending: boolean;
}

function AlternativePanel({ hint, onChange, onCancel, onSubmit, isPending }: AlternativePanelProps) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <input
        value={hint}
        onChange={(e) => onChange(e.target.value)}
        placeholder='Optional nudge — e.g. "more concise" or "emphasize leadership"'
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
        <LoadingButton isLoading={isPending} onClick={onSubmit}>
          Try again
        </LoadingButton>
      </div>
    </div>
  );
}
