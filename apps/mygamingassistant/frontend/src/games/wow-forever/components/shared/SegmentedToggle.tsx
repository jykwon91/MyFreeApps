import clsx from "clsx";
import { cn } from "@platform/ui";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import type { SegmentedOption } from "@/games/wow-forever/types/segmentedOption";

interface SegmentedToggleProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  /** Null = none of these options is picked (another group holds the choice). */
  value: T | null;
  onChange: (value: T) => void;
  /** Extra classes for the group, e.g. "flex-wrap" when there are many options.
   *  Layout classes (grid, flex, inline-flex) in className override the default
   *  inline-flex because the merge uses tailwind-merge. */
  className?: string;
  /** Narrow padding and text on phones, so long names fit three to a row. */
  compact?: boolean;
}

/** Single-choice pill toggle (radio group semantics). */
export default function SegmentedToggle<T extends string>({ label, options, value, onChange, className, compact = false }: SegmentedToggleProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border bg-card p-1 gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={clsx(
            "inline-flex items-center justify-center gap-1.5 rounded-md min-h-[44px] sm:min-h-[36px] transition-colors",
            compact ? "px-1 text-xs sm:px-3 sm:text-sm" : "px-3 text-sm",
            o.id === value && "bg-primary text-primary-foreground",
            o.id !== value && "hover:bg-muted/40",
          )}
        >
          {o.icon !== undefined ? <GameIcon icon={o.icon} size={16} alt="" /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}
