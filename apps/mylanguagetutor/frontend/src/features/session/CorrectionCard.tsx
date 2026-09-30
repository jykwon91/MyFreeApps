import type { CorrectionItem } from "@/types/tutor/correction";

interface CorrectionCardProps {
  correction: CorrectionItem;
  languageName: string;
}

/**
 * One gentle correction. Hedged on purpose: speech recognition may have
 * misheard, so we say what it *looked like* the learner said rather than
 * asserting they said it.
 */
export default function CorrectionCard({ correction, languageName }: CorrectionCardProps) {
  return (
    <li className="rounded-md border bg-card px-3 py-2 text-sm">
      <p>
        It looked like you said <span className="font-medium">"{correction.error_span}"</span>
        {" "}— natural {languageName}:{" "}
        <span className="font-medium text-primary">"{correction.corrected_span}"</span>
      </p>
      {correction.explanation && (
        <p className="mt-1 text-xs text-muted-foreground">{correction.explanation}</p>
      )}
    </li>
  );
}
