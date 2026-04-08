import { cn } from "@/shared/utils/cn";
import { FILING_STATUS_OPTIONS } from "@/shared/lib/tax-config";

interface Props {
  value: string | null;
  onChange: (value: string) => void;
}

export default function FilingStatusStep({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Your filing status affects your tax brackets and deductions. Pick the one that matches your situation.
      </p>
      <div className="grid grid-cols-1 gap-3">
        {FILING_STATUS_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors min-h-[44px] flex items-start gap-3",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                  selected ? "border-primary bg-primary" : "border-muted-foreground",
                )}
              >
                {selected && <span className="block h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
              </span>
              <span>
                <span className="block font-medium text-sm">{option.label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
