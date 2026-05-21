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
import { useCallback, useEffect, useId, useState } from "react";
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
import {
  useLazyGetLineupAdminQuery,
  useWidenPaneSourceMutation,
} from "@/store/lineupsApi";

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
  // YouTube anchor: the admin payload carries the source-video id + chapter
  // marker so the Trim slider can render approximate-in-video timestamps and
  // expose the "Widen source" affordance. Both are null on manual-upload
  // lineups (no YouTube source → no widen possible, no chapter to anchor on).
  const youtubeVideoId = adminLineup?.youtube_video_id ?? null;
  const chapterStartSeconds = adminLineup?.chapter_start_seconds ?? null;

  // Per-pane on-demand widen — re-cut a wider source from the YouTube video
  // around the chapter marker. State stays local to the orchestrator (not the
  // usePaneTrim hook) because widening is orthogonal to the trim transaction:
  // it changes the SOURCE the slider binds against, not the trim itself.
  const [widenPaneSource] = useWidenPaneSourceMutation();
  const [isWidening, setIsWidening] = useState(false);
  const [widenError, setWidenError] = useState<string | null>(null);

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

  // Widen-source dispatcher. On success we close the slider and re-arm
  // ``awaitingOpen`` so the existing open-after-source-resolves effect
  // re-opens it once the new admin payload and ``useClipDuration`` settle on
  // the wider source — the brief transition through the scissors-button
  // spinner state is the natural "fetching new bounds" feedback.
  const handleWiden = useCallback(async () => {
    setWidenError(null);
    setIsWidening(true);
    try {
      await widenPaneSource({ lineup_id: lineupId, pane }).unwrap();
      setAwaitingOpen(true);
      close();
    } catch (err) {
      setWidenError(extractError(err) ?? "Could not widen source");
    } finally {
      setIsWidening(false);
    }
  }, [widenPaneSource, lineupId, pane, close]);

  const handleDismissWidenError = useCallback(() => {
    setWidenError(null);
  }, []);

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
        chapterStartSeconds={chapterStartSeconds}
        canWiden={!!youtubeVideoId}
        isWidening={isWidening}
        widenError={widenError}
        onWiden={handleWiden}
        onDismissWidenError={handleDismissWidenError}
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

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown } };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
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

// Build the slider footer readout. When the source clip has a YouTube
// chapter anchor we surface approximate-in-video timestamps (cleaner
// mental model than ``Xs into source``); otherwise we fall back to the
// pre-PR3 seconds-into-clip shape. The approximation note: the formula
// adds the slider offset to ``chapter_start_seconds`` rather than the
// true source-clip-start-in-video (which would require backend to expose
// per-row pre-padding). The drift is ``clip_source_pre_seconds`` (~15s)
// and the preview <video> is the operator's authoritative visual anchor;
// the readout exists to help them remember "roughly where in the source
// video" they are.
function buildReadout(
  startOffsetS: number,
  endOffsetS: number,
  clipDurationS: number,
  chapterStartSeconds: number | null,
): string {
  if (chapterStartSeconds == null) {
    return (
      `${startOffsetS.toFixed(1)}s — ${endOffsetS.toFixed(1)}s / ` +
      `${clipDurationS.toFixed(1)}s`
    );
  }
  const startVideoTime = formatVideoTimestamp(chapterStartSeconds + startOffsetS);
  const endVideoTime = formatVideoTimestamp(chapterStartSeconds + endOffsetS);
  return `${startVideoTime} — ${endVideoTime} / source ${clipDurationS.toFixed(1)}s`;
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
  // PR3 — in-video anchor for the absolute-timestamp readout. Null on
  // manual-upload lineups (no YouTube source); falls back to the legacy
  // seconds-into-source format.
  chapterStartSeconds: number | null;
  // PR3 — gates the "Widen source" link. False when the lineup has no
  // ``youtube_video_id``, which is the only signal the backend's 404
  // contract gives us upfront ("manual uploads cannot be widened").
  canWiden: boolean;
  isWidening: boolean;
  widenError: string | null;
  onWiden: () => void;
  onDismissWidenError: () => void;
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
  chapterStartSeconds,
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
    chapterStartSeconds,
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

      {/* Readout — selected range / clip total. When the lineup has a
          YouTube chapter anchor we render approximate-in-video timestamps
          (chapter_start_seconds + slider offset); otherwise we fall back
          to the legacy seconds-into-source shape. See ``buildReadout``. */}
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
          minimize-ternaries — keep the surface uncluttered).

          ``aria-live`` on the error span: the error replaces the link in
          situ when widen fails, so the screen-reader announcement
          surfaces the actionable reason (e.g. "chapter no longer exists
          in the source video") without an extra modal.

          Loading affordance: the link text swaps to ``Widening...`` with
          an inline spinner the instant the request fires
          (visible-loading-feedback.md — affordance at click time, not
          response time). The widen call can take 5-30s (yt-dlp +
          ffmpeg) so the spinner is the wait-shape match. */}
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

interface WidenSourceLinkProps {
  isWidening: boolean;
  widenError: string | null;
  label: string;
  pane: TrimmablePane;
  onWiden: () => void;
  onDismissError: () => void;
}

function WidenSourceLink({
  isWidening,
  widenError,
  label,
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
            aria-label={`Retry widen on ${pane} source`}
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
        isWidening ? `Widening ${pane} source` : `Widen ${pane} source clip`
      }
      title="Re-cut a wider source from the YouTube video around the chapter"
      className={[
        "self-center inline-flex items-center gap-1",
        "text-[10px] text-white/70 hover:text-white underline",
        "disabled:opacity-60 disabled:cursor-wait disabled:hover:text-white/70",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1",
      ].join(" ")}
    >
      {isWidening ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : null}
      {label}
    </button>
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
