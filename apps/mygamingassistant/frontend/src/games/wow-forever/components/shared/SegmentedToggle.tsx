import clsx from "clsx";

interface SegmentedToggleProps<T extends string> {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Extra classes for the group, e.g. "flex-wrap" when there are many options. */
  className?: string;
}

/** Single-choice pill toggle (radio group semantics). */
export default function SegmentedToggle<T extends string>({ label, options, value, onChange, className }: SegmentedToggleProps<T>) {
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
            "rounded-md px-3 text-sm min-h-[44px] sm:min-h-[36px] transition-colors",
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
