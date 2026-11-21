import { TilePicker } from "@platform/ui";
import { FILING_STATUS_OPTIONS } from "@/shared/lib/tax-config";

export interface FilingStatusStepProps {
  value: string | null;
  onChange: (value: string) => void;
}

export default function FilingStatusStep({ value, onChange }: FilingStatusStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Your filing status affects your tax brackets and deductions. Pick the one that matches your situation.
      </p>
      <TilePicker
        ariaLabel="Filing status"
        options={FILING_STATUS_OPTIONS}
        value={value ?? ""}
        onChange={onChange}
      />
    </div>
  );
}
