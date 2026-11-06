import clsx from "clsx";

interface MultiChoiceChipsProps<T extends string> {
  legend: string;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  value: readonly T[];
  onChange: (value: T[]) => void;
}

/** Pick any number of values: toggle chips (aria-pressed), 44px tall, wrapping on phones. */
export default function MultiChoiceChips<T extends string>({ legend, options, labels, value, onChange }: MultiChoiceChipsProps<T>) {
  function toggle(option: T): void {
    if (value.includes(option)) onChange(value.filter((v) => v !== option));
    else onChange(options.filter((o) => o === option || value.includes(o)));
  }

  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const picked = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={picked}
              onClick={() => toggle(o)}
              className={clsx(
                "min-h-[44px] rounded-full border px-3 text-sm transition-colors",
                picked && "border-primary bg-primary text-primary-foreground",
                !picked && "bg-card hover:bg-muted/40",
              )}
            >
              {labels[o]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
