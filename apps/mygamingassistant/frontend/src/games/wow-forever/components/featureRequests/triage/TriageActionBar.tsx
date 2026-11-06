import { useId, useState, type Ref } from "react";
import { ChevronDown } from "lucide-react";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_PRIMARY_BUTTON, TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";

interface TriageActionBarProps {
  approveRef: Ref<HTMLButtonElement>;
  onApprove: () => void;
  onEdit: () => void;
  onMerge: () => void;
  onNotPlanned: () => void;
  onHide: () => void;
}

/** Approve (primary, full width on a phone), then Edit · Merge… · More (Not planned…, Hide). */
export default function TriageActionBar({ approveRef, onApprove, onEdit, onMerge, onNotPlanned, onHide }: TriageActionBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  return (
    <div className="space-y-2" data-row="actions">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button ref={approveRef} type="button" data-triage-approve onClick={onApprove} className={TRIAGE_PRIMARY_BUTTON}>
          {TRIAGE_COPY.approve}
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEdit} className={TRIAGE_SECONDARY_BUTTON}>
            {TRIAGE_COPY.edit}
          </button>
          <button type="button" onClick={onMerge} className={TRIAGE_SECONDARY_BUTTON}>
            {TRIAGE_COPY.merge}
          </button>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((o) => !o)}
            className={TRIAGE_SECONDARY_BUTTON}
          >
            {TRIAGE_COPY.more}
            <ChevronDown size={16} aria-hidden />
          </button>
        </div>
      </div>
      {moreOpen ? (
        <div id={moreId} className="flex flex-wrap gap-2">
          <button type="button" onClick={onNotPlanned} className={TRIAGE_SECONDARY_BUTTON}>
            {TRIAGE_COPY.notPlannedAction}
          </button>
          <button type="button" onClick={onHide} className={TRIAGE_SECONDARY_BUTTON}>
            {TRIAGE_COPY.hide}
          </button>
        </div>
      ) : null}
    </div>
  );
}
