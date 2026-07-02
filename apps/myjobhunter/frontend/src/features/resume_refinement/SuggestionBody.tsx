import { useState } from "react";
import { LoadingButton, Skeleton } from "@platform/ui";

interface SuggestionBodyProps {
  clarifyingQuestion: string | null;
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

// Three-way render of the suggestion area: clarification banner (the
// answer goes through the always-visible composer below the card), AI
// proposal (with optional regenerating skeleton), or "thinking"
// placeholder. Uses early returns instead of a nested ternary chain
// per the JSX-conditional convention.
export default function SuggestionBody({
  clarifyingQuestion,
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
      <div className="space-y-2">
        <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
          {clarifyingQuestion}
        </div>
        {canForce && onForce && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-2">
            <p className="text-xs text-muted-foreground">
              Sure those details are right? Apply the held rewrite as-is.
            </p>
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={forceIsLoading}
              onClick={onForce}
              disabled={isPending && !forceIsLoading}
            >
              Use it anyway — I confirm this is accurate
            </LoadingButton>
          </div>
        )}
        {/* The recovery path when the flagged detail is a genuinely
            wrong FACT: facts are edited in Profile, not here. Opens a
            new tab so the in-progress session isn't lost. */}
        <p className="text-xs text-muted-foreground">
          Is a fact wrong here (title, dates, employer)? I can't edit facts —{" "}
          <a
            href="/profile"
            target="_blank"
            rel="noopener"
            className="underline hover:text-foreground"
          >
            head to Profile
          </a>{" "}
          to fix it, then come back.
        </p>
      </div>
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
