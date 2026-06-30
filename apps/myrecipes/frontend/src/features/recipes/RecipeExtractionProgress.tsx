import { useEffect, useRef, useState } from "react";
import Spinner from "@platform/ui/components/icons/Spinner";

/**
 * Full-section loading display for the synchronous (~5-30s) extraction call.
 * Deliberately offers no Cancel — cancelling the request would not stop the
 * server-side work, so it would imply a guarantee we can't keep. Focus moves
 * here on mount and the status is announced for screen readers.
 */
export default function RecipeExtractionProgress() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showTimeHint, setShowTimeHint] = useState(false);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  useEffect(() => {
    // Hold the reassurance back ~5s so it doesn't create anxiety on fast calls.
    const timer = setTimeout(() => setShowTimeHint(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-3 py-16 text-center outline-none"
    >
      <Spinner className="h-10 w-10 text-primary" />
      <p className="text-base">Reading your recipe photo...</p>
      {showTimeHint ? (
        <p className="text-sm text-muted-foreground">This usually takes up to 30 seconds.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Navigating away will cancel the import.</p>
      <span className="sr-only" aria-live="polite">
        {showTimeHint ? "Still working — this can take up to 30 seconds." : ""}
      </span>
    </div>
  );
}
