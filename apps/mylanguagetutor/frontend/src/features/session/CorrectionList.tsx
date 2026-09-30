import CorrectionCard from "@/features/session/CorrectionCard";
import type { CorrectionItem } from "@/types/tutor/correction";

interface CorrectionListProps {
  corrections: CorrectionItem[];
  languageName: string;
}

/** The corrections for one learner turn; renders nothing when there are none. */
export default function CorrectionList({ corrections, languageName }: CorrectionListProps) {
  if (corrections.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Suggestions">
      {corrections.map((correction, index) => (
        <CorrectionCard
          key={`${correction.error_span}-${index}`}
          correction={correction}
          languageName={languageName}
        />
      ))}
    </ul>
  );
}
