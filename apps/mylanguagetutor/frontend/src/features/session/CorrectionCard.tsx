import type { CorrectionItem } from "@mylanguagetutor/api-client/types/tutor/correction-item";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";

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
        {PRACTICE_COPY.correctionSaid} <span className="font-medium">"{correction.error_span}"</span>
        {" "}{PRACTICE_COPY.correctionNatural} {languageName}:{" "}
        <span className="font-medium text-primary">"{correction.corrected_span}"</span>
      </p>
      {correction.explanation && (
        <p className="mt-1 text-xs text-muted-foreground">{correction.explanation}</p>
      )}
    </li>
  );
}
