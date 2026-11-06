import TriageSheetFrame from "@/games/wow-forever/components/featureRequests/triage/TriageSheetFrame";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";

interface TriageSheetGoneProps {
  onClose: () => void;
}

/** A sheet link (`?story=…`) whose story isn't loaded any more — merged away or already triaged. */
export default function TriageSheetGone({ onClose }: TriageSheetGoneProps) {
  return (
    <TriageSheetFrame title={TRIAGE_COPY.editTitle} onClose={onClose}>
      <p className="text-sm">{TRIAGE_COPY.storyGone}</p>
    </TriageSheetFrame>
  );
}
