import { Loader2, RotateCcw } from "lucide-react";
import type { ShiftablePane } from "@/hooks/usePaneWindowShift";

interface WidenSourceLinkProps {
  isWidening: boolean;
  widenError: string | null;
  pane: ShiftablePane;
  onWiden: () => void;
  onDismissError: () => void;
}

export default function WidenSourceLink({
  isWidening,
  widenError,
  pane,
  onWiden,
  onDismissError,
}: WidenSourceLinkProps) {
  if (widenError != null) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-0.5 text-[10px] leading-tight"
      >
        <span className="text-red-400 text-center px-1">{widenError}</span>
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
    <button
      type="button"
      onClick={onWiden}
      disabled={isWidening}
      aria-label={
        isWidening
          ? "Widening source"
          : "Widen source — recuts wider footage for all four panes"
      }
      title="Re-cut wider footage from the source video — shared across all four panes"
      className={[
        "self-center inline-flex items-center gap-1",
        "text-[10px] text-white/70 hover:text-white underline",
        "disabled:opacity-60 disabled:cursor-wait disabled:hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1",
      ].join(" ")}
    >
      {isWidening ? (
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
      ) : null}
      {isWidening ? "Widening..." : "Widen source"}
    </button>
  );
}
