import ClarifyingPanel from "@/features/resume_refinement/ClarifyingPanel";

interface SuggestionBodyProps {
  clarifyingQuestion: string | null;
  customText: string;
  onCustomTextChange: (s: string) => void;
  onClarifySubmit: () => void;
  proposal: string | null;
  rationale: string | null;
  isPending: boolean;
}

// Three-way render of the suggestion area: clarification request,
// AI proposal, or "thinking" placeholder. Uses early returns instead
// of a nested ternary chain per the JSX-conditional convention.
export default function SuggestionBody({
  clarifyingQuestion,
  customText,
  onCustomTextChange,
  onClarifySubmit,
  proposal,
  rationale,
  isPending,
}: SuggestionBodyProps) {
  if (clarifyingQuestion) {
    return (
      <ClarifyingPanel
        question={clarifyingQuestion}
        customText={customText}
        onCustomTextChange={onCustomTextChange}
        onSubmit={onClarifySubmit}
        isPending={isPending}
      />
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
          <p className="text-xs text-muted-foreground italic mt-2">{rationale}</p>
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
