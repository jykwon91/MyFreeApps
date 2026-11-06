import { Select } from "@platform/ui";
import { FEATURE_AREAS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import { FEATURE_AREA_LABEL } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";

interface TriageAreaSelectProps {
  id: string;
  value: FeatureArea;
  onChange: (area: FeatureArea) => void;
  /** Visible label text; defaults to "Area". */
  label?: string;
}

/** A story's area (required — no empty option). */
export default function TriageAreaSelect({ id, value, onChange, label = TRIAGE_COPY.area }: TriageAreaSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(FEATURE_AREAS.find((a) => a === e.target.value) ?? value)}
        className="min-h-11 bg-card text-base sm:text-sm"
      >
        {FEATURE_AREAS.map((a) => (
          <option key={a} value={a}>
            {FEATURE_AREA_LABEL[a]}
          </option>
        ))}
      </Select>
    </div>
  );
}
