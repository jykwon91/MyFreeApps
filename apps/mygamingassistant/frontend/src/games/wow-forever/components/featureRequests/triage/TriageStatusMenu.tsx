import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_NEXT_STATUSES } from "@/games/wow-forever/data/featureRequests/triage/triageStatusMenu";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { TriageStatusOption } from "@/games/wow-forever/types/featureRequests/triage/triageStatusOption";

interface TriageStatusMenuProps {
  status: FeatureStoryStatus;
  onPick: (option: TriageStatusOption) => void;
}

/** "Change status": only the valid next states for the current status. Nothing to show = no button. */
export default function TriageStatusMenu({ status, onPick }: TriageStatusMenuProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const options = TRIAGE_NEXT_STATUSES[status];
  if (options.length === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={TRIAGE_SECONDARY_BUTTON}
      >
        {TRIAGE_COPY.changeStatus}
        <ChevronDown size={16} aria-hidden />
      </button>
      {open ? (
        <ul id={listId} aria-label={TRIAGE_COPY.changeStatus} className="flex flex-wrap gap-2">
          {options.map((option) => (
            <li key={option.status}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(option);
                }}
                className={TRIAGE_SECONDARY_BUTTON}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
