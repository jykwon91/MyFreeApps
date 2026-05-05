import { cn } from "@/shared/utils/cn";
import { TAX_SITUATION_OPTIONS } from "@/shared/lib/tax-config";

export interface TaxSituationStepProps {
  value: string[];
  onChange: (value: string[]) => void;
}

export default function TaxSituationStep({ value, onChange }: TaxSituationStepProps) {
  function toggle(option: string) {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option));
    } else {
      onChange([...value, option]);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select everything that applies to you — I'll use this to figure out which tax forms are relevant.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TAX_SITUATION_OPTIONS.map((option) => {
          const selected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                "text-left rounded-lg border p-4 transition-colors min-h-[44px]",
                selected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <p className="font-medium text-sm">{option.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
            </button>
          );
        })}
      </div>
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">Select at least one to continue.</p>
      )}
    </div>
  );
}
