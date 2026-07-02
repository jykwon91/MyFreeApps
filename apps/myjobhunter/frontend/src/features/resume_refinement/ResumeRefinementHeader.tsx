import { Sparkles } from "lucide-react";

interface ResumeRefinementHeaderProps {
  compact?: boolean;
  onStartNew?: () => void;
  /** Override the escape-hatch label — "Cancel" while preparing (it's
   *  an exit from a wait, not a choice among sessions). */
  startNewLabel?: string;
}

export default function ResumeRefinementHeader({
  compact = false,
  onStartNew,
  startNewLabel,
}: ResumeRefinementHeaderProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Resume refinement</h1>
        </div>
        {onStartNew && (
          <button
            type="button"
            onClick={onStartNew}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            {startNewLabel ?? "Start a different session"}
          </button>
        )}
      </div>
    );
  }
  return (
    <header>
      <div className="flex items-center gap-2">
        <Sparkles className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Resume refinement</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-0.5">
        Iterate on your resume one bullet at a time. AI suggests, you accept
        or override, and at the end you download a polished PDF or DOCX.
      </p>
    </header>
  );
}
