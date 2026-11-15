import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface TrainerRecipesPanelHeaderProps {
  name: string;
  onClose: () => void;
}

/** Trainer name and close button. The heading takes focus on mount so the panel is announced and scrolled into view. */
export default function TrainerRecipesPanelHeader({ name, onClose }: TrainerRecipesPanelHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center justify-between gap-2">
      <h3 ref={headingRef} tabIndex={-1} className="font-semibold focus:outline-none">
        {name}
      </h3>
      <button
        type="button"
        aria-label={`Close ${name}'s recipes`}
        onClick={onClose}
        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted/50 min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
