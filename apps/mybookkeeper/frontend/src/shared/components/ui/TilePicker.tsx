import { cn } from "@/shared/utils/cn";

export interface TileOption {
  value: string;
  label: string;
  description: string;
}

interface Props {
  options: TileOption[];
  value: string;
  onChange: (value: string) => void;
  columns?: 1 | 2;
}

export default function TilePicker({ options, value, onChange, columns = 1 }: Props) {
  return (
    <div className={cn("grid gap-3", columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
      {options.map((option) => {
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
  );
}
