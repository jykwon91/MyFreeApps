interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleChipGroupProps {
  options: ToggleOption[];
  value: string[];
  onChange: (next: string[]) => void;
}

/**
 * Multi-select chip group. Each chip toggles its value in/out of the
 * array. Selected chips highlight; unselected are ghost-styled.
 *
 * Used on /discover for the "Exclude industries" surface where each
 * chip semantically represents a curated denylist (defined server-side
 * in industry_denylists.py).
 *
 * Mobile-friendly: chips wrap and each one is 36px tall by default.
 */
export default function ToggleChipGroup({
  options,
  value,
  onChange,
}: ToggleChipGroupProps) {
  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const selected = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={selected}
            className={[
              "px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[36px]",
              selected
                ? "bg-primary text-primary-foreground border border-primary"
                : "bg-background text-muted-foreground border border-input hover:text-foreground hover:border-foreground",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
