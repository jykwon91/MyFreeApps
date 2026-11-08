import { GitCompare } from "lucide-react";
import clsx from "clsx";

interface TalentCompareToggleProps {
  active: boolean;
  onChange: (active: boolean) => void;
}

/**
 * Toggle button that switches on "Compare to Classic" mode: highlights
 * talents changed from Classic Era on the trees and shows side-by-side
 * Classic/Forever text in the detail panel.
 */
export default function TalentCompareToggle({ active, onChange }: TalentCompareToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onChange(!active)}
      data-testid="talent-compare-toggle"
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-3 text-sm min-h-[44px] transition-colors",
        active
          ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          : "hover:bg-muted/40",
      )}
    >
      <GitCompare aria-hidden className="h-4 w-4" />
      Compare to Classic
    </button>
  );
}
