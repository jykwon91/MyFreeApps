import { type KeyboardEvent } from "react";
import { LoadingButton } from "@platform/ui";

interface ClarifyingPanelProps {
  question: string;
  customText: string;
  onCustomTextChange: (s: string) => void;
  onSubmit: () => void;
  isPending: boolean;
  /** Loop breaker: the guard flagged this target twice — offer applying
   *  the held proposal with explicit user confirmation. */
  canForce?: boolean;
  onForce?: () => void;
  forceIsLoading?: boolean;
}

export default function ClarifyingPanel({
  question,
  customText,
  onCustomTextChange,
  onSubmit,
  isPending,
  canForce = false,
  onForce,
  forceIsLoading = false,
}: ClarifyingPanelProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isPending || !customText.trim()) return;
    onSubmit();
  }

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
        {question}
      </div>
      <textarea
        value={customText}
        onChange={(e) => onCustomTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        placeholder="Type your answer — I'll use it to compose a suggestion. Enter to send, Shift+Enter for newline."
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
      />
      <div className="flex justify-end">
        <LoadingButton
          isLoading={isPending && !forceIsLoading}
          onClick={onSubmit}
          disabled={!customText.trim() || isPending}
        >
          Submit answer
        </LoadingButton>
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
    </div>
  );
}
