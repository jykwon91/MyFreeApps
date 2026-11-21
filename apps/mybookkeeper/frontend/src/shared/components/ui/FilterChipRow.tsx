import { cn } from "@/shared/utils/cn";

export interface FilterChipOption<T extends string> {
  /** ``null`` is the "All" chip. */
  value: T | null;
  label: string;
}

export interface FilterChipRowProps<T extends string> {
  options: ReadonlyArray<FilterChipOption<T>>;
  value: T | null;
  onChange: (next: T | null) => void;
  ariaLabel: string;
  /** Chips get ``data-testid="<prefix>-<value>"``; the "All" chip uses ``all``. */
  testIdPrefix: string;
}

/**
 * Single-select filter chips with 44px touch targets that scroll horizontally
 * on mobile. Filters are toggle buttons (``aria-pressed``), not tabs: they
 * narrow one list instead of switching between panels.
 */
export default function FilterChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  testIdPrefix,
}: FilterChipRowProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-nowrap overflow-x-auto gap-2 pb-1 -mx-1 px-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
            data-testid={`${testIdPrefix}-${option.value ?? "all"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
