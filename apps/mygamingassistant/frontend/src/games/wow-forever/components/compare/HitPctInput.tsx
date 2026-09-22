import { useState } from "react";

interface HitPctInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

const MAX_HIT_PCT = 100;

/** Optional "hit % from your other gear" — empty means unknown. */
export default function HitPctInput({ value, onChange }: HitPctInputProps) {
  const [text, setText] = useState(value === null ? "" : String(value));

  function handleChange(next: string) {
    setText(next);
    const trimmed = next.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n <= MAX_HIT_PCT) onChange(n);
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Hit % from your other gear (optional)</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={MAX_HIT_PCT}
        step={0.1}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="e.g. 6"
        className="border rounded-md px-3 py-2 text-sm min-h-[44px] w-40 bg-card"
      />
    </label>
  );
}
