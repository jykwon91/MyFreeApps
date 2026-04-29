import { Star } from "lucide-react";
import { cn } from "@/shared/utils/cn";

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Toggle button that filters the rolodex to preferred-only vendors. Uses
 * the same 44px touch target as the category chips so the two filters feel
 * paired. ``aria-pressed`` reflects state for screen readers.
 */
export default function VendorPreferredToggle({ value, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      data-testid="vendor-preferred-toggle"
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors",
        value
          ? "bg-yellow-500 text-white hover:bg-yellow-500/90"
          : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      <Star
        className={cn("h-4 w-4", value ? "fill-current" : "")}
        aria-hidden="true"
      />
      Preferred only
    </button>
  );
}
