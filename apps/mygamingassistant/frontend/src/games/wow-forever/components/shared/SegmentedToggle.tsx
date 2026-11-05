import clsx from "clsx";

interface SegmentedToggleProps<T extends string> {
  label: string;
  options: readonly { id: T; label: string }[];
  /** Null = none of these options is picked (another group holds the choice). */
  value: T | null;
  onChange: (value: T) => void;
  /** Extra classes for the group, e.g. "flex-wrap" when there are many options. */
  className?: string;
  /** Narrow padding and text on phones, so long names fit three to a row. */
  compact?: boolean;
}

/** Single-choice pill toggle (radio group semantics). */
export default function SegmentedToggle<T extends string>({ label, options, value, onChange, className, compact = false }: SegmentedToggleProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={clsx("inline-flex rounded-lg border bg-card p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={clsx(
            "rounded-md min-h-[44px] sm:min-h-[36px] transition-colors",
            compact ? "px-1 text-xs sm:px-3 sm:text-sm" : "px-3 text-sm",
            o.id === value && "bg-primary text-primary-foreground",
            o.id !== value && "hover:bg-muted/40",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
