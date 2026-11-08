import clsx from "clsx";

interface FacetChipGroupProps<T extends string> {
  legend: string;
  options: readonly T[];
  label: (option: T) => string;
  value: readonly T[];
  /** How many items each chip would show with the other filters as they are. */
  counts: ReadonlyMap<string, number>;
  onChange: (value: T[]) => void;
  testId: string;
}

/**
 * Pick any number of values, each chip with its item count (aria-pressed, 44px
 * tall, wrapping on phones). A chip with nothing to show is dimmed but stays
 * clickable when picked, so it can always be turned off.
 */
export default function FacetChipGroup<T extends string>({ legend, options, label, value, counts, onChange, testId }: FacetChipGroupProps<T>) {
  function toggle(option: T): void {
    if (value.includes(option)) onChange(value.filter((v) => v !== option));
    else onChange(options.filter((o) => o === option || value.includes(o)));
  }

  return (
    <fieldset className="min-w-0 space-y-1" data-testid={testId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const picked = value.includes(o);
          const count = counts.get(o) ?? 0;
          const empty = count === 0 && !picked;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={picked}
              disabled={empty}
              onClick={() => toggle(o)}
              className={clsx(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                picked && "border-primary bg-primary text-primary-foreground",
                !picked && !empty && "bg-card hover:bg-muted/40",
                empty && "cursor-not-allowed bg-card opacity-50",
              )}
            >
              <span>{label(o)}</span>
              <span className={clsx("tabular-nums text-xs", !picked && "text-muted-foreground")}>{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
