import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_PRIORITIES } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import { priorityLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";

interface TriagePriorityPickerProps {
  value: number | null;
  onChange: (priority: number | null) => void;
}

const NONE = "none";
const OPTIONS: readonly { id: string; label: string }[] = [
  { id: NONE, label: "—" },
  ...TRIAGE_PRIORITIES.map((p) => ({ id: String(p), label: priorityLabel(p) })),
];

/** Private priority: none, P1, P2 or P3 (P1 = most important). */
export default function TriagePriorityPicker({ value, onChange }: TriagePriorityPickerProps) {
  return (
    <SegmentedToggle
      label={TRIAGE_COPY.priority}
      options={OPTIONS}
      value={value === null ? NONE : String(value)}
      onChange={(id) => onChange(id === NONE ? null : Number(id))}
    />
  );
}
