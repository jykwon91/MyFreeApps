export interface SegmentedControlOption<K extends string> {
  key: K;
  label: string;
}

export interface SegmentedControlProps<K extends string> {
  options: readonly SegmentedControlOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Read by screen readers as the group's name. */
  label: string;
  /** Prefix for test ids: the group is ``{testIdPrefix}``, each option ``{testIdPrefix}-{key}``. */
  testIdPrefix: string;
}

/** A row of toggle buttons where exactly one is pressed, each a 44px touch target. */
export default function SegmentedControl<K extends string>({
  options, value, onChange, label, testIdPrefix,
}: SegmentedControlProps<K>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border" data-testid={testIdPrefix}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.key)}
            className={`min-h-[44px] min-w-[44px] px-3 text-sm font-medium first:rounded-l-md last:rounded-r-md ${selected ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            data-testid={`${testIdPrefix}-${option.key}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
