import { useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  className?: string;
}

function toText(value: number | null): string {
  if (value === null) return "";
  return String(value);
}

function parse(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Numeric input that keeps what the user is typing ("1.", "-") while still
 * following outside changes (e.g. after a tooltip is read into the item).
 */
export default function NumberField({ label, value, onChange, step = 1, min, hideLabel = false, className }: NumberFieldProps) {
  const [text, setText] = useState(toText(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (parse(text) !== value) setText(toText(value));
  }

  return (
    <label className={className ?? "flex flex-col gap-1"}>
      <span className={hideLabel ? "sr-only" : "text-xs font-medium text-muted-foreground"}>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
        className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-full bg-card"
      />
    </label>
  );
}
