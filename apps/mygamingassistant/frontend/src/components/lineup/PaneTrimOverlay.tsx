/**
 * PaneTrimOverlay — per-pane clip trim affordance (PR2).
 *
 * Mirrors ``PaneReplaceOverlay`` (PR1) structurally so the two affordances
 * coexist on the same pane with consistent UX:
 *
 *   1. **Idle** — scissors icon at ``bottom-1.5 left-1.5`` (diagonally
 *      opposite PR1's Replace icon). Hover/focus-revealed. Hidden when
 *      ``clipUrl`` is null or unknown — no clip = nothing to trim.
 *
 *   2. **Open** — full-pane scrim + two-thumb range slider + readout +
 *      Apply / Cancel. Slider drags update the in-memory range only;
 *      Apply POSTs to the trim endpoint.
 *
 *   3. **Applying** — scrim + indeterminate shimmer bar (the server doesn't
 *      stream progress on an ffmpeg cut; honest about not-knowing rather
 *      than fake-precision).
 *
 *   4. **Error** — scrim + red message + Retry. Same shape as PR1's
 *      ``PaneReplaceOverlay`` error state.
 *
 * Mutual exclusion with PR1's Replace overlay is visual, not logical: when
 * either overlay is in a non-idle state, its full-pane scrim covers the
 * other's idle affordance. Both overlays still render simultaneously when
 * idle (each in a different corner) — that's intentional so the operator
 * sees both options on hover.
 */
import { useEffect, useId } from "react";
import { RotateCcw, Scissors, X } from "lucide-react";

import { useClipDuration } from "@/hooks/useClipDuration";
import {
  MIN_TRIM_DURATION_S,
  usePaneTrim,
  type TrimmablePane,
} from "@/hooks/usePaneTrim";

import PaneRangeScrubber from "./PaneRangeScrubber";

interface PaneTrimOverlayProps {
  lineupId: string;
  pane: TrimmablePane;
  /** Presigned MinIO URL for the existing clip on this pane (or null when
   *  the pane has no clip yet — affordance is suppressed in that case). */
  clipUrl: string | null;
}

export default function PaneTrimOverlay({
  lineupId,
  pane,
  clipUrl,
}: PaneTrimOverlayProps) {
  const clipDurationS = useClipDuration(clipUrl);
  const { phase, open, close, updateRange, apply, retry } = usePaneTrim({
    lineupId,
    pane,
  });

  // Escape closes the slider when open OR clears an error.
  useEffect(() => {
    if (phase.phase === "closed" || phase.phase === "applying") return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase.phase, close]);

  // No clip → no trim affordance. (PaneTrimOverlay never mounts in that case
  // per the parent guard, but defending here keeps the component honest
  // against future call sites.)
  if (!clipUrl) return null;

  if (phase.phase === "closed") {
    // Idle scissors icon. Disabled until duration is known so we can pass
    // a sane upper bound to open().
    return (
      <button
        type="button"
        onClick={() => clipDurationS != null && open(clipDurationS)}
        aria-label={`Trim ${pane} clip duration`}
        title={`Trim ${pane}`}
        disabled={clipDurationS == null}
        className={[
          "absolute bottom-1.5 left-1.5 z-10",
          "opacity-0 group-hover/pane:opacity-100 focus-visible:opacity-100",
          "transition-opacity duration-150",
          "p-1.5 rounded bg-black/60 text-white hover:bg-black/80",
          "disabled:opacity-0 disabled:pointer-events-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-inset",
        ].join(" ")}
      >
        <Scissors className="w-3.5 h-3.5" aria-hidden />
      </button>
    );
  }

  if (phase.phase === "open") {
    return (
      <TrimSliderPanel
        startOffsetS={phase.startOffsetS}
        endOffsetS={phase.endOffsetS}
        clipDurationS={phase.clipDurationS}
        onChange={updateRange}
        onApply={apply}
        onClose={close}
        pane={pane}
      />
    );
  }

  if (phase.phase === "applying") {
    return <ApplyingScrim pane={pane} />;
  }

  // phase.phase === "error"
  return (
    <ErrorScrim
      message={phase.message}
      onRetry={retry}
      onClose={close}
      pane={pane}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components — extracted so the orchestrator's JSX stays flat (no
// nested ternaries per feedback_minimize_ternaries_extract_types.md).
// ---------------------------------------------------------------------------

interface TrimSliderPanelProps {
  startOffsetS: number;
  endOffsetS: number;
  clipDurationS: number;
  onChange: (start: number, end: number) => void;
  onApply: () => void;
  onClose: () => void;
  pane: TrimmablePane;
}

function TrimSliderPanel({
  startOffsetS,
  endOffsetS,
  clipDurationS,
  onChange,
  onApply,
  onClose,
  pane,
}: TrimSliderPanelProps) {
  const duration = endOffsetS - startOffsetS;
  const canApply = duration >= MIN_TRIM_DURATION_S;
  const headerId = useId();
  return (
    <div
      role="dialog"
      aria-labelledby={headerId}
      className="absolute inset-0 z-10 bg-black/70 flex flex-col justify-end p-1.5 gap-1"
    >
      <span id={headerId} className="sr-only">{`Trim ${pane} clip`}</span>
      {/* Close (top-right) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cancel trim"
        className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>

      <PaneRangeScrubber
        max={clipDurationS}
        startValue={startOffsetS}
        endValue={endOffsetS}
        minWindow={MIN_TRIM_DURATION_S}
        onChange={onChange}
      />

      {/* Readout — selected range / clip total */}
      <div className="text-center text-[10px] text-white/80 leading-tight">
        {startOffsetS.toFixed(1)}s — {endOffsetS.toFixed(1)}s / {clipDurationS.toFixed(1)}s
      </div>

      {/* Apply button — disabled below the min-window threshold */}
      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        aria-label={
          canApply ? "Trim clip" : `Trim clip (minimum ${MIN_TRIM_DURATION_S}s)`
        }
        className={[
          "self-center px-3 py-1 rounded text-[11px] font-semibold",
          "bg-white text-black hover:bg-white/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        ].join(" ")}
      >
        Trim clip
      </button>
    </div>
  );
}

function ApplyingScrim({ pane }: { pane: TrimmablePane }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Trimming ${pane} clip, please wait`}
      className="absolute inset-0 z-10 bg-black/50 flex flex-col justify-end"
    >
      {/* Indeterminate shimmer bar at the bottom edge. ffmpeg doesn't
          stream progress, so animate width-cycling rather than fake-precise
          progress. */}
      <div className="relative h-0.5 bg-white/20 w-full overflow-hidden">
        <div className="absolute h-full w-1/3 bg-white animate-[shimmer_1.4s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

interface ErrorScrimProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
  pane: TrimmablePane;
}

function ErrorScrim({ message, onRetry, onClose, pane }: ErrorScrimProps) {
  return (
    <div
      role="alert"
      className="absolute inset-0 z-10 bg-black/70 flex flex-col items-center justify-center gap-1.5 px-2 text-center"
    >
      <span className="text-xs font-semibold text-red-400 leading-tight">
        {message}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          aria-label={`Retry trim on ${pane} clip`}
          className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          <RotateCcw className="w-3 h-3" aria-hidden />
          Retry
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel trim"
          className="text-[11px] text-white/60 hover:text-white/80 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
