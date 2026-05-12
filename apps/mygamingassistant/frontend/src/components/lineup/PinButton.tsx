/**
 * PinButton — small toggle button that pins / unpins a lineup.
 *
 * Shows a filled pin icon when pinned, outlined when not.
 * Used inside LineupCard (both expanded and thumbnail variants).
 */
import { Pin } from "lucide-react";

interface PinButtonProps {
  isPinned: boolean;
  onToggle: () => void;
  className?: string;
}

export default function PinButton({ isPinned, onToggle, className = "" }: PinButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Prevent the click from bubbling into a thumbnail card's outer button.
        e.stopPropagation();
        onToggle();
      }}
      aria-label={isPinned ? "Unpin lineup" : "Pin lineup"}
      aria-pressed={isPinned}
      className={[
        "flex items-center justify-center rounded-md transition-colors min-h-[32px] min-w-[32px]",
        isPinned
          ? "text-primary hover:text-primary/70"
          : "text-muted-foreground hover:text-foreground",
        className,
      ].join(" ")}
    >
      <Pin
        className="w-4 h-4"
        fill={isPinned ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
}
