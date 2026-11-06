import type { ShiftablePane } from "@/hooks/usePaneWindowShift";
import PreviewVideo from "./PreviewVideo";
import WidenSourceLink from "./WidenSourceLink";

interface SliderBodyProps {
  offsetS: number;
  maxOffset: number;
  sourceDurationS: number;
  widerSourceUrl: string | null;
  onChange: (offset: number) => void;
  onApply: () => void;
  pane: ShiftablePane;
  isWidening: boolean;
  widenError: string | null;
  onWiden: () => void;
  onDismissError: () => void;
}

export default function SliderBody({
  offsetS,
  maxOffset,
  sourceDurationS,
  widerSourceUrl,
  onChange,
  onApply,
  pane,
  isWidening,
  widenError,
  onWiden,
  onDismissError,
}: SliderBodyProps) {
  const canApply = !isWidening;

  // Preview <video> — same shape as the Trim editor's preview but constrained
  // to a single seek point (offsetS) instead of a [start, end] loop. We
  // attach the wider source URL directly and seek on offset changes; ffmpeg
  // would re-cut on Apply anyway, so an in-browser preview is good enough.
  // The native HTML5 <video> handles the seek smoothly; no custom hook
  // needed for the single-thumb case.

  return (
    <>
      {/* Preview: seek the wider source to the current offset so the
          operator can see what the served clip will start on. ``aria-hidden``
          because the input below is the semantic control surface. */}
      {widerSourceUrl ? (
        <PreviewVideo
          widerSourceUrl={widerSourceUrl}
          offsetS={offsetS}
        />
      ) : null}

      <input
        type="range"
        min={0}
        max={maxOffset}
        step={0.1}
        value={offsetS}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={`${pane} window start offset`}
        aria-valuemin={0}
        aria-valuemax={maxOffset}
        aria-valuenow={offsetS}
        disabled={isWidening}
        className="w-full h-2 accent-white cursor-pointer disabled:cursor-not-allowed"
      />

      <div className="text-center text-[10px] text-white/80 leading-tight tabular-nums">
        {`${formatVideoTimestamp(offsetS)} (1.0s window) / source ${sourceDurationS.toFixed(1)}s`}
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        aria-label="Shift window"
        className={[
          "self-center px-3 py-1 rounded text-[11px] font-semibold",
          "bg-white text-black hover:bg-white/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        ].join(" ")}
      >
        Shift window
      </button>

      <WidenSourceLink
        isWidening={isWidening}
        widenError={widenError}
        pane={pane}
        onWiden={onWiden}
        onDismissError={onDismissError}
      />
    </>
  );
}

function formatVideoTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
