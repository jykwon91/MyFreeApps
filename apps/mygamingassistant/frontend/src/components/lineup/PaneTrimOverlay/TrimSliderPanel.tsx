import { useId, useState } from "react";
import { X } from "lucide-react";
import {
  MIN_TRIM_DURATION_S,
  type TrimmablePane,
} from "@/hooks/usePaneTrim";
import {
  useTrimPreviewVideo,
  type TrimPreviewThumb,
} from "@/hooks/useTrimPreviewVideo";
import PaneRangeScrubber from "../PaneRangeScrubber";
import WidenSourceLink from "./WidenSourceLink";

interface TrimSliderPanelProps {
  startOffsetS: number;
  endOffsetS: number;
  clipDurationS: number;
  clipUrl: string;
  onChange: (start: number, end: number) => void;
  onApply: () => void;
  onClose: () => void;
  pane: TrimmablePane;
  // In-video anchor for the absolute-timestamp readout — where the wider
  // source clip starts in the source video timeline. Null on manual uploads
  // (no YouTube source), missing chapter anchors, or legacy ``tight==wide``
  // rows; the readout falls back to seconds-into-source in those cases.
  sourceStartInVideoS: number | null;
  // PR3 — gates the "Widen source" link. False when the lineup has no
  // ``youtube_video_id``, which is the only signal the backend's 404
  // contract gives us upfront ("manual uploads cannot be widened").
  canWiden: boolean;
  isWidening: boolean;
  widenError: string | null;
  onWiden: () => void;
  onDismissWidenError: () => void;
}

export default function TrimSliderPanel({
  startOffsetS,
  endOffsetS,
  clipDurationS,
  clipUrl,
  onChange,
  onApply,
  onClose,
  pane,
  sourceStartInVideoS,
  canWiden,
  isWidening,
  widenError,
  onWiden,
  onDismissWidenError,
}: TrimSliderPanelProps) {
  const duration = endOffsetS - startOffsetS;
  const canApply = duration >= MIN_TRIM_DURATION_S && !isWidening;
  const headerId = useId();

  // Drag-aware preview (PR3). The scrubber surfaces its active-thumb state
  // up via onThumbChange; the preview hook seeks to the active offset and
  // pauses on drag, then loops between [start, end] when idle.
  const [activeThumb, setActiveThumb] = useState<TrimPreviewThumb>(null);
  const { videoRef, isSeeking, hasError } = useTrimPreviewVideo({
    clipUrl,
    startOffsetS,
    endOffsetS,
    activeThumb,
  });

  const readout = buildReadout(
    startOffsetS,
    endOffsetS,
    clipDurationS,
    sourceStartInVideoS,
  );

  // Widen-source affordance is hidden — not just disabled — when the
  // lineup has no YouTube source. The button would be permanently
  // unclickable for manual-upload lineups; pulling it from the layout
  // keeps the slider footer uncluttered for that majority case.
  const widenButtonLabel = isWidening ? "Widening..." : "Widen source";

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
        disabled={isWidening}
        className="absolute top-1.5 right-1.5 z-20 p-1 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>

      {/* Live preview (PR3). Fills the vertical space above the slider via
          the parent's ``flex flex-col justify-end`` layout. Always rendered
          so the ref stays attached; if the underlying clip URL fails to
          load, the element decays to a black box and the slider remains
          fully operable (Apply still works, just no preview).
          ``aria-hidden`` because the slider thumbs are the semantic
          control surface (role=slider + aria-valuenow). */}
      <video
        ref={videoRef}
        src={clipUrl}
        muted
        playsInline
        preload="auto"
        aria-hidden
        className={[
          "w-full aspect-video object-cover rounded-sm",
          "transition-opacity duration-100",
          isSeeking ? "opacity-50" : "opacity-100",
          hasError ? "invisible" : "visible",
        ].join(" ")}
      />

      <PaneRangeScrubber
        max={clipDurationS}
        startValue={startOffsetS}
        endValue={endOffsetS}
        minWindow={MIN_TRIM_DURATION_S}
        onChange={onChange}
        onThumbChange={setActiveThumb}
      />

      {/* Readout — selected range / clip total. When the wider source
          carries a known in-video start anchor we render absolute-in-video
          timestamps (``sourceStartInVideoS`` + slider offset); otherwise
          we fall back to the seconds-into-source shape. See ``buildReadout``. */}
      <div className="text-center text-[10px] text-white/80 leading-tight tabular-nums">
        {readout}
      </div>

      {/* Apply button — disabled below the min-window threshold AND
          during a Widen request (mutating the source under an in-flight
          trim would be a foot-gun). */}
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

      {/* Widen-source affordance (PR3). Renders as a low-emphasis text
          link under the Apply button — operator-facing power-user feature,
          not a primary action. Click → POST to the per-pane widen-source
          endpoint, then the orchestrator closes the slider and re-arms
          ``awaitingOpen`` so it re-opens with the new wider bounds once
          the admin payload + clip-duration resolve.

          Hidden entirely when the lineup has no YouTube source: a
          permanently-disabled button is worse UX than an absent one for
          the manual-upload majority case (per visible-loading-feedback /
          minimize-ternaries — keep the surface uncluttered). */}
      {canWiden ? (
        <WidenSourceLink
          isWidening={isWidening}
          widenError={widenError}
          label={widenButtonLabel}
          pane={pane}
          onWiden={onWiden}
          onDismissError={onDismissWidenError}
        />
      ) : null}
    </div>
  );
}

// Format an in-video timestamp (seconds → ``M:SS.s``). Always shows
// minutes for visual stability so a ``0:45.3`` doesn't suddenly jump shape
// to ``1:03.4`` mid-drag. Padding the seconds to two whole digits keeps
// the readout monospace-friendly even though the surrounding glyphs are
// proportional.
function formatVideoTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

// Build the slider footer readout. When the wider source clip has a
// known in-video start anchor we surface absolute-in-video timestamps
// (cleaner mental model than ``Xs into source``); otherwise we fall back
// to the seconds-into-source shape. The anchor (``sourceStartInVideoS``)
// comes from the backend and accounts for the pre-padding the wider source
// carries — slider offset 0 maps to ``sourceStartInVideoS`` in the source
// video, not to ``chapter_start_seconds`` (the earlier shape drifted by
// ``settings.clip_source_pre_seconds`` because it conflated chapter start
// with source-clip start).
function buildReadout(
  startOffsetS: number,
  endOffsetS: number,
  clipDurationS: number,
  sourceStartInVideoS: number | null,
): string {
  if (sourceStartInVideoS == null) {
    return (
      `${startOffsetS.toFixed(1)}s — ${endOffsetS.toFixed(1)}s / ` +
      `${clipDurationS.toFixed(1)}s`
    );
  }
  const startVideoTime = formatVideoTimestamp(sourceStartInVideoS + startOffsetS);
  const endVideoTime = formatVideoTimestamp(sourceStartInVideoS + endOffsetS);
  return `${startVideoTime} — ${endVideoTime} / source ${clipDurationS.toFixed(1)}s`;
}
