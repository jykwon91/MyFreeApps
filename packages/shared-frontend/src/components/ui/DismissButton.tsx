import { X } from "lucide-react";
import type { DismissButtonProps } from "../../types/dismiss-button-props";

/**
 * Close button for dismissable info tips. The 44px touch target is offset with
 * a negative margin so the tip keeps the layout of a small icon button.
 */
export default function DismissButton({ onClick, label = "Dismiss" }: DismissButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -m-2.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
    >
      <X size={14} />
    </button>
  );
}
