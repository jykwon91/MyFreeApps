import { Select } from "@platform/ui";

interface ChoiceSelectProps<T extends string> {
  id: string;
  label: string;
  options: readonly T[];
  labels: Readonly<Record<T, string>>;
  /** Undefined = nothing picked (the empty option). */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  emptyLabel: string;
}

/** A labelled native select over a fixed set of values, with an empty "not picked" option. */
export default function ChoiceSelect<T extends string>({
  id,
  label,
  options,
  labels,
  value,
  onChange,
  emptyLabel,
}: ChoiceSelectProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(options.find((o) => o === e.target.value))}
        className="min-h-[44px] bg-card text-base sm:text-sm"
      >
        <option value="">{emptyLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </Select>
    </div>
  );
}
