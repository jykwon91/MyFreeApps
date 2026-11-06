import { Loader2, RotateCcw } from "lucide-react";
import type { ShiftablePane } from "@/hooks/usePaneWindowShift";

interface WidenFirstCTAProps {
  isWidening: boolean;
  widenError: string | null;
  pane: ShiftablePane;
  onWiden: () => void;
  onDismissError: () => void;
}

export default function WidenFirstCTA({
  isWidening,
  widenError,
  pane,
  onWiden,
  onDismissError,
}: WidenFirstCTAProps) {
  // Wider source isn't available — the operator can't shift until they
  // widen the throw pane (which widens the shared source for stand/aim
  // simultaneously). Render a small prompt + action button in place of
  // the scrubber. Same Widen → fetchAdmin → re-open cycle as the inline
  // widen affordance, just with the prompt being the primary call to
  // action instead of a tertiary link.
  if (widenError != null) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-1 text-[10px] leading-tight px-2 py-3"
      >
        <span className="text-red-400 text-center">{widenError}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onWiden}
            aria-label={`Retry widen for ${pane} source`}
            className="inline-flex items-center gap-1 text-white/80 hover:text-white underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
          >
            <RotateCcw className="w-3 h-3" aria-hidden />
            Retry
          </button>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss widen error"
            className="text-white/60 hover:text-white/80 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-[10px] leading-tight px-2 py-3">
      <p className="text-white/80 text-center max-w-[200px]">
        Widen source first to enable shifting. This recuts a wider chapter
        clip for all four panes.
      </p>
      <button
        type="button"
        onClick={onWiden}
        disabled={isWidening}
        aria-label={
          isWidening ? "Widening source" : "Widen source for all four panes"
        }
        className={[
          "inline-flex items-center gap-1 mt-1 px-2 py-1 rounded text-[11px]",
          "bg-white text-black hover:bg-white/90",
          "disabled:opacity-60 disabled:cursor-wait",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        ].join(" ")}
      >
        {isWidening ? (
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
        ) : null}
        {isWidening ? "Widening..." : "Widen source"}
      </button>
    </div>
  );
}
