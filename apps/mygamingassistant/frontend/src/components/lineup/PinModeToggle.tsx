/**
 * PinModeToggle — radio-style pills controlling the lineup-pin layer on MapPage.
 *
 * Off       → hide pins, fall back to zone-density only
 * Stand     → render one pin per lineup at its stand position
 * Target    → render one pin per lineup at its target position
 * Both      → render both, color-coded (stand=blue, target=orange)
 */
import type { PinMode } from "./MapLineupPins";

interface Props {
  mode: PinMode | null;
  onChange: (next: PinMode | null) => void;
}

const OPTIONS: { value: PinMode | null; label: string }[] = [
  { value: null, label: "Off" },
  { value: "stand", label: "Stand" },
  { value: "target", label: "Target" },
  { value: "both", label: "Both" },
];

export default function PinModeToggle({ mode, onChange }: Props) {
  return (
    <div
      className="ml-auto inline-flex gap-1 items-center rounded-md border bg-card p-0.5"
      role="radiogroup"
      aria-label="Lineup pins on minimap"
    >
      <span className="px-2 text-xs text-muted-foreground">Pins</span>
      {OPTIONS.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={[
              "px-2.5 py-1 rounded text-xs font-medium transition-colors min-h-[30px]",
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted/40",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
