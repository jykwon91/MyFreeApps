/**
 * PaneTrimOverlay — per-pane clip trim affordance.
 *
 * Mirrors ``PaneReplaceOverlay`` (PR1) structurally so the two affordances
 * coexist on the same pane with consistent UX:
 *
 *   1. **Idle** — scissors icon at ``bottom-1.5 left-1.5`` (diagonally
 *      opposite PR1's Replace icon). Hover/focus-revealed. Hidden when
 *      ``clipUrl`` is null — no clip = nothing to trim.
 *
 *   2. **Fetching** — scrim + spinner while we lazy-load the admin payload
 *      for this lineup (PR4 — the source-clip URL + stored trim offsets are
 *      operator-only fields the public list deliberately omits). The fetch
 *      is RTK-Query-cached per lineup id, so subsequent opens are instant.
 *
 *   3. **Open** — full-pane scrim + two-thumb range slider + readout +
 *      Apply / Cancel. The slider is bound on the SOURCE duration, not the
 *      currently-served clip, so the operator can drag past whatever the
 *      previous trim left behind. Thumbs pre-fill to the stored offsets
 *      (the "where I currently am" state) when present; otherwise to the
 *      full source range.
 *
 *   4. **Applying** — scrim + indeterminate shimmer bar (the server doesn't
 *      stream progress on an ffmpeg cut; honest about not-knowing rather
 *      than fake-precision).
 *
 *   5. **Error** — scrim + red message + Retry. Same shape as PR1's
 *      ``PaneReplaceOverlay`` error state.
 *
 * Mutual exclusion with PR1's Replace overlay is visual, not logical: when
 * either overlay is in a non-idle state, its full-pane scrim covers the
 * other's idle affordance. Both overlays still render simultaneously when
 * idle (each in a different corner) — that's intentional so the operator
 * sees both options on hover.
 */
import { useEffect, useId, useState } from "react";
import { Loader2, RotateCcw, Scissors, X } from "lucide-react";

import { useClipDuration } from "@/hooks/useClipDuration";
import {
  MIN_TRIM_DURATION_S,
  usePaneTrim,
  type TrimmablePane,
} from "@/hooks/usePaneTrim";
import {
  useTrimPreviewVideo,
  type TrimPreviewThumb,
} from "@/hooks/useTrimPreviewVideo";
import { useLazyGetLineupAdminQuery } from "@/store/lineupsApi";

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
  const { phase, open, close, updateRange, apply, retry } = usePaneTrim({
    lineupId,
    pane,
  });

  // Admin-payload fetch — lazy so the public list payload stays unchanged
  // and only logged-in operators pay the cost, and only on first click of
  // the scissors per lineup (RTK Query caches the result by id).
  const [fetchAdmin, adminResult] = useLazyGetLineupAdminQuery();

  // Track operator intent across the async fetch — without this, an admin
  // cache that pre-resolved earlier would cause the slider to spring open
  // unsolicited the next time the operator hovered the pane. State (not
  // ref) so toggling it re-runs the auto-open effect when the admin
  // payload was already cached at click time.
  const [awaitingOpen, setAwaitingOpen] = useState(false);

  const adminLineup = adminResult.data ?? null;
  const sourceUrl = resolveSourceUrl(adminLineup, pane, clipUrl);
  const sourceDurationS = useClipDuration(sourceUrl);
  const storedOffsets = resolveStoredOffsets(adminLineup, pane);

  // Escape closes the slider when open OR clears an error.
  useEffect(() => {
    if (phase.phase === "closed" || phase.phase === "applying") return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase.phase, close]);

  // Once the admin payload resolves AND the operator has explicitly asked to
  // open (``awaitingOpen``), open the slider with bounds = source duration +
  // thumbs pre-filled to the stored trim window. ``isFetching`` is false on
  // cached hits so the transition is instant on the second open of the same
  // lineup. The awaitingOpen gate ensures a cached admin payload doesn't
  // re-open the slider on its own after Apply transitions phase back to
  // "closed".
  useEffect(() => {
    if (!awaitingOpen) return;
    if (phase.phase !== "closed") return;
    if (!adminResult.isSuccess || sourceDurationS == null) return;
    if (!adminResult.originalArgs || adminResult.originalArgs !== lineupId) return;
    setAwaitingOpen(false);
    open(sourceDurationS, storedOffsets);
  }, [
    awaitingOpen,
    adminResult.isSuccess,
    adminResult.originalArgs,
    lineupId,
    phase.phase,
    sourceDurationS,
    storedOffsets,
    open,
  ]);

  const handleScissorsClick = () => {
    setAwaitingOpen(true);
    void fetchAdmin(lineupId, /* preferCacheValue */ true);
  };

  // No clip → no trim affordance. (PaneTrimOverlay never mounts in that case
  // per the parent guard, but defending here keeps the component honest
  // against future call sites.)
  if (!clipUrl) return null;

  if (phase.phase === "closed") {
    const isFetching =
      awaitingOpen &&
      (adminResult.isFetching || (adminResult.isSuccess && sourceDurationS == null));
    return (
      <button
        type="button"
        onClick={handleScissorsClick}
        aria-label={`Trim ${pane} clip duration`}
        title={`Trim ${pane}`}
        disabled={isFetching}
        className={[
          "absolute bottom-1.5 left-1.5 z-10",
          "opacity-0 group-hover/pane:opacity-100 focus-visible:opacity-100",
          isFetching ? "opacity-100" : "",
          "transition-opacity duration-150",
          "p-1.5 rounded bg-black/60 text-white hover:bg-black/80",
          "disabled:cursor-wait disabled:hover:bg-black/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-inset",
        ].join(" ")}
      >
        {isFetching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        ) : (
          <Scissors className="w-3.5 h-3.5" aria-hidden />
        )}
      </button>
    );
  }

  if (phase.phase === "open") {
    // Slider preview must reach for the SOURCE clip, not the
    // currently-served trimmed clip — otherwise the operator dragging the
    // thumbs outward past the previous trim's bounds would see nothing.
    const previewUrl = sourceUrl ?? clipUrl;
    return (
      <TrimSliderPanel
        startOffsetS={phase.startOffsetS}
        endOffsetS={phase.endOffsetS}
        clipDurationS={phase.clipDurationS}
        clipUrl={previewUrl}
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
// Helpers — pane-aware accessors for the admin payload's per-pane original
// URL + offset pair. Centralising the switch here keeps the orchestrator's
// JSX flat (one switch in two places would be a maintenance trap).
// ---------------------------------------------------------------------------

function resolveSourceUrl(
  admin: { clip_url_original: string | null; landing_clip_url_original: string | null } | null,
  pane: TrimmablePane,
  fallbackClipUrl: string | null,
): string | null {
  if (!admin) return null;
  const original =
    pane === "throw" ? admin.clip_url_original : admin.landing_clip_url_original;
  // Fall back to the currently-served clip when the admin payload doesn't
  // carry an original (legacy/missed-backfill row). The PR4 service has the
  // same fallback on the server.
  return original ?? fallbackClipUrl;
}

function resolveStoredOffsets(
  admin: {
    clip_trim_start_s: number | null;
    clip_trim_end_s: number | null;
    landing_clip_trim_start_s: number | null;
    landing_clip_trim_end_s: number | null;
  } | null,
  pane: TrimmablePane,
): { startOffsetS: number; endOffsetS: number } | null {
  if (!admin) return null;
  const start = pane === "throw" ? admin.clip_trim_start_s : admin.landing_clip_trim_start_s;
  const end = pane === "throw" ? admin.clip_trim_end_s : admin.landing_clip_trim_end_s;
  if (start == null || end == null) return null;
  return { startOffsetS: start, endOffsetS: end };
}


// ---------------------------------------------------------------------------
// Sub-components — extracted so the orchestrator's JSX stays flat (no
// nested ternaries per feedback_minimize_ternaries_extract_types.md).
// ---------------------------------------------------------------------------

interface TrimSliderPanelProps {
  startOffsetS: number;
  endOffsetS: number;
  clipDurationS: number;
  clipUrl: string;
  onChange: (start: number, end: number) => void;
  onApply: () => void;
  onClose: () => void;
  pane: TrimmablePane;
}

function TrimSliderPanel({
  startOffsetS,
  endOffsetS,
  clipDurationS,
  clipUrl,
  onChange,
  onApply,
  onClose,
  pane,
}: TrimSliderPanelProps) {
  const duration = endOffsetS - startOffsetS;
  const canApply = duration >= MIN_TRIM_DURATION_S;
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
        className="absolute top-1.5 right-1.5 z-20 p-1 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
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
