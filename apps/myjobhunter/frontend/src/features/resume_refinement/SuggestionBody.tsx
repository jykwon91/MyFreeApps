import { useState } from "react";
import { Skeleton } from "@platform/ui";
import ClarifyingPanel from "@/features/resume_refinement/ClarifyingPanel";

interface SuggestionBodyProps {
  clarifyingQuestion: string | null;
  customText: string;
  onCustomTextChange: (s: string) => void;
  onClarifySubmit: () => void;
  proposal: string | null;
  rationale: string | null;
  isPending: boolean;
  /** True while an alternative is being regenerated — shows skeleton instead of stale text. */
  isRegenerating?: boolean;
  /** Guard loop breaker: offer applying the held proposal with explicit confirmation. */
  canForce?: boolean;
  onForce?: () => void;
  forceIsLoading?: boolean;
}

// Three-way render of the suggestion area: clarification request,
// AI proposal (with optional regenerating skeleton), or "thinking"
// placeholder. Uses early returns instead of a nested ternary chain
// per the JSX-conditional convention.
export default function SuggestionBody({
  clarifyingQuestion,
  customText,
  onCustomTextChange,
  onClarifySubmit,
  proposal,
  rationale,
  isPending,
  isRegenerating = false,
  canForce = false,
  onForce,
  forceIsLoading = false,
}: SuggestionBodyProps) {
  const [showRationale, setShowRationale] = useState(false);

  if (clarifyingQuestion) {
    return (
      <ClarifyingPanel
        question={clarifyingQuestion}
        customText={customText}
        onCustomTextChange={onCustomTextChange}
        onSubmit={onClarifySubmit}
        isPending={isPending}
        canForce={canForce}
        onForce={onForce}
        forceIsLoading={forceIsLoading}
      />
    );
  }

  // Regenerating skeleton: keep the emerald box frame so layout doesn't jump.
  if (isRegenerating) {
    return (
      <div className="rounded-md border border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-500/10 p-3 space-y-2">
        <p className="text-[11px] uppercase tracking-wide text-emerald-900/70 dark:text-emerald-200/70 font-semibold">
          Proposed rewrite
        </p>
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    );
  }

  if (proposal) {
    return (
      <div className="rounded-md border border-emerald-400/50 bg-emerald-50/60 dark:bg-emerald-500/10 p-3">
        <p className="text-[11px] uppercase tracking-wide text-emerald-900/70 dark:text-emerald-200/70 font-semibold mb-1">
          Proposed rewrite
        </p>
        <p className="text-sm whitespace-pre-wrap">{proposal}</p>
        {rationale && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowRationale((v) => !v)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              {showRationale ? "Hide why" : "Why?"}
            </button>
            {showRationale && (
              <p className="text-xs text-muted-foreground italic mt-1">{rationale}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Hmm, let me think. Working on a suggestion…
    </p>
  );
}
