/**
 * MicroClipShiftOverlay — per-pane STAND/AIM shift-window affordance.
 *
 * Sibling of ``PaneTrimOverlay`` (PR4 pane editor) — same structural shape
 * and visual language, but the served micro-clip width is FIXED at 1
 * second so the operator only chooses where the window STARTS inside the
 * shared wider source ``clip_url_original``. One offset (vs the start/end
 * pair throw/landing use); single-thumb scrubber (vs the two-thumb
 * PaneRangeScrubber).
 *
 * Same state machine PaneTrimOverlay drives, with one extra branch for
 * "no wider source yet — widen first":
 *
 *   1. **Idle**     — scissors at ``bottom-1.5 left-1.5`` (diagonally
 *                     opposite Replace). Hidden when clipUrl is null.
 *   2. **Fetching** — scrim + spinner while admin payload loads.
 *   3. **Open**     — full-pane scrim + single-thumb scrubber + readout +
 *                     Apply / Cancel. When no wider source is ready the
 *                     scrubber is replaced by a "Widen source first" CTA
 *                     that calls the throw widen-source endpoint (the
 *                     wider source is shared across all four panes — see
 *                     PR1 design notes).
 *   4. **Applying** — scrim + indeterminate shimmer.
 *   5. **Error**    — scrim + red message + Retry.
 *
 * Mutual exclusion with Replace + Trim overlays is visual, not logical:
 * full-pane scrim covers their idle affordances during a non-idle state.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, RotateCcw, Scissors, X } from "lucide-react";

import { useClipDuration } from "@/hooks/useClipDuration";
import {
  MICRO_CLIP_DURATION_S,
  usePaneWindowShift,
  type ShiftablePane,
} from "@/hooks/usePaneWindowShift";
import {
  useLazyGetLineupAdminQuery,
  useWidenPaneSourceMutation,
} from "@/store/lineupsApi";

interface MicroClipShiftOverlayProps {
  lineupId: string;
  pane: ShiftablePane;
  /** Presigned MinIO URL for the served 1s micro-clip on this pane (or null
   *  when ingest skipped it — affordance is suppressed in that case). */
  clipUrl: string | null;
}

export default function MicroClipShiftOverlay({
  lineupId,
  pane,
  clipUrl,
}: MicroClipShiftOverlayProps) {
  const { phase, open, close, updateOffset, apply, retry } =
    usePaneWindowShift({ lineupId, pane });

  // Admin-payload fetch — same lazy/cached pattern as PaneTrimOverlay. Public
  // payload never carries clip_url_original; only operators pay the cost.
  const [fetchAdmin, adminResult] = useLazyGetLineupAdminQuery();

  // Track operator intent across the async fetch — without this, an admin
  // cache that resolved earlier would cause the slider to spring open
  // unsolicited the next time the operator hovered the pane.
  const [awaitingOpen, setAwaitingOpen] = useState(false);

  const adminLineup = adminResult.data ?? null;
  const widerSourceUrl = resolveWiderSourceUrl(adminLineup);
  const widerSourceDurationS = useClipDuration(widerSourceUrl);
  const storedOffset = resolvePaneOffset(adminLineup, pane);

  // Per-pane on-demand widen-source. The throw endpoint widens the shared
  // clip_url_original — unlocking shifting for stand/aim/throw/landing all
  // at once (PR1 design: stand/aim REUSE the throw wider source rather than
  // keeping per-pane originals). So we always send pane=throw here even when
  // the operator clicked scissors on stand/aim.
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
  // open (``awaitingOpen``), open the slider with bounds = wider source
  // duration + thumb pre-filled to the stored offset. ``awaitingOpen``
  // ensures a cached admin payload doesn't re-open the slider on its own
  // after Apply transitions phase back to "closed".
  useEffect(() => {
    if (!awaitingOpen) return;
    if (phase.phase !== "closed") return;
    if (!adminResult.isSuccess) return;
    if (!adminResult.originalArgs || adminResult.originalArgs !== lineupId) return;
    // Two branches once admin resolves:
    //   - Wider source ready (URL present + duration known) → open slider
    //   - No wider source (URL null or duration not yet known) → still
    //     transition to ``open`` (with sourceDurationS=0); the open-phase
    //     UI then renders the "Widen source first" CTA instead of the
    //     scrubber. The slider duration probe ``useClipDuration`` resolves
    //     to null when the URL is null OR loading; we use the URL alone as
    //     the gate so a missing wider source surfaces the widen prompt
    //     immediately rather than spinning forever.
    if (!widerSourceUrl) {
      setAwaitingOpen(false);
      open(0, null);
      return;
    }
    if (widerSourceDurationS == null) return;
    setAwaitingOpen(false);
    open(widerSourceDurationS, storedOffset);
  }, [
    awaitingOpen,
    adminResult.isSuccess,
    adminResult.originalArgs,
    lineupId,
    phase.phase,
    widerSourceUrl,
    widerSourceDurationS,
    storedOffset,
    open,
  ]);

  const handleScissorsClick = () => {
    setAwaitingOpen(true);
    void fetchAdmin(lineupId, /* preferCacheValue */ true);
  };

  const handleWiden = useCallback(async () => {
    setWidenError(null);
    setIsWidening(true);
    try {
      // ALWAYS widen via the throw pane — see component-level comment. The
      // throw widen-source endpoint refreshes clip_url_original which is
      // also what stand/aim's shift slider indexes into.
      await widenPaneSource({ lineup_id: lineupId, pane: "throw" }).unwrap();
      // Re-arm awaitingOpen so the open-after-admin-resolves effect re-opens
      // the slider with the new wider bounds once useClipDuration settles
      // on the wider source.
      setAwaitingOpen(true);
      close();
    } catch (err) {
      setWidenError(extractError(err) ?? "Could not widen source");
    } finally {
      setIsWidening(false);
    }
  }, [widenPaneSource, lineupId, close]);

  const handleDismissWidenError = useCallback(() => {
    setWidenError(null);
  }, []);

  // No served micro-clip → no shift affordance. (Parent guards against this
  // in GlanceBoardTile's PaneSlot, but defending here keeps the component
  // honest against future call sites.)
  if (!clipUrl) return null;

  if (phase.phase === "closed") {
    const isFetching =
      awaitingOpen &&
      (adminResult.isFetching ||
        (adminResult.isSuccess &&
          widerSourceUrl != null &&
          widerSourceDurationS == null));
    return (
      <button
        type="button"
        onClick={handleScissorsClick}
        aria-label={`Shift ${pane} micro-clip window`}
        title={`Shift ${pane}`}
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
    return (
      <ShiftSliderPanel
        offsetS={phase.offsetS}
        sourceDurationS={phase.sourceDurationS}
        widerSourceUrl={widerSourceUrl}
        onChange={updateOffset}
        onApply={apply}
        onClose={close}
        pane={pane}
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
// Helpers — pane-aware accessors for the admin payload. Stand/aim each read
// their own ``*_clip_offset_s`` column (the throw/landing trim offsets are
// orthogonal). The wider source URL is SHARED — both panes index into the
// same ``clip_url_original``.
// ---------------------------------------------------------------------------

function resolveWiderSourceUrl(
  admin: { clip_url_original: string | null; clip_url: string | null } | null,
): string | null {
  if (!admin) return null;
  // Treat "original equals served" as "no wider source" — the ingest
  // widen-source step fell back to the legacy posture and shifting would
  // be a no-op. Matches the backend service's 409 gate.
  if (!admin.clip_url_original) return null;
  if (admin.clip_url_original === admin.clip_url) return null;
  return admin.clip_url_original;
}

function resolvePaneOffset(
  admin: {
    stand_clip_offset_s: number | null;
    aim_clip_offset_s: number | null;
  } | null,
  pane: ShiftablePane,
): number | null {
  if (!admin) return null;
  return pane === "stand" ? admin.stand_clip_offset_s : admin.aim_clip_offset_s;
}

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown } };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
}

function formatVideoTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// ShiftSliderPanel — the open-phase UI. Renders either the scrubber (when
// the wider source is ready) or a "Widen source first" CTA (when not).
// ---------------------------------------------------------------------------

interface ShiftSliderPanelProps {
  offsetS: number;
  sourceDurationS: number;
  widerSourceUrl: string | null;
  onChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  pane: ShiftablePane;
  isWidening: boolean;
  widenError: string | null;
  onWiden: () => void;
  onDismissWidenError: () => void;
}

function ShiftSliderPanel({
  offsetS,
  sourceDurationS,
  widerSourceUrl,
  onChange,
  onApply,
  onClose,
  pane,
  isWidening,
  widenError,
  onWiden,
  onDismissWidenError,
}: ShiftSliderPanelProps) {
  const headerId = useId();
  const hasWiderSource =
    widerSourceUrl != null && sourceDurationS > MICRO_CLIP_DURATION_S;
  const maxOffset = Math.max(0, sourceDurationS - MICRO_CLIP_DURATION_S);

  return (
    <div
      role="dialog"
      aria-labelledby={headerId}
      className="absolute inset-0 z-10 bg-black/70 flex flex-col justify-end p-1.5 gap-1"
    >
      <span id={headerId} className="sr-only">{`Shift ${pane} micro-clip window`}</span>
      {/* Close (top-right) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cancel shift"
        disabled={isWidening}
        className="absolute top-1.5 right-1.5 z-20 p-1 rounded bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <X className="w-3 h-3" aria-hidden />
      </button>

      {hasWiderSource ? (
        <SliderBody
          offsetS={offsetS}
          maxOffset={maxOffset}
          sourceDurationS={sourceDurationS}
          widerSourceUrl={widerSourceUrl}
          onChange={onChange}
          onApply={onApply}
          pane={pane}
          isWidening={isWidening}
          widenError={widenError}
          onWiden={onWiden}
          onDismissError={onDismissWidenError}
        />
      ) : (
        <WidenFirstCTA
          isWidening={isWidening}
          widenError={widenError}
          pane={pane}
          onWiden={onWiden}
          onDismissError={onDismissWidenError}
        />
      )}
    </div>
  );
}

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

function SliderBody({
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

interface PreviewVideoProps {
  widerSourceUrl: string;
  offsetS: number;
}

function PreviewVideo({ widerSourceUrl, offsetS }: PreviewVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Seek on offset change. ``preload="auto"`` ensures the browser keeps
    // enough buffered around the seek point for a snappy scrub. The
    // currentTime assignment may throw before metadata loads (esp. on
    // first mount); swallow + retry on next render is the documented
    // behaviour for media-elements.
    try {
      v.currentTime = offsetS;
    } catch {
      /* metadata not yet loaded — next render will retry on offset change */
    }
  }, [offsetS]);

  return (
    <video
      ref={videoRef}
      src={widerSourceUrl}
      muted
      playsInline
      preload="auto"
      aria-hidden
      className="w-full aspect-video object-cover rounded-sm"
    />
  );
}

interface WidenFirstCTAProps {
  isWidening: boolean;
  widenError: string | null;
  pane: ShiftablePane;
  onWiden: () => void;
  onDismissError: () => void;
}

function WidenFirstCTA({
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

interface WidenSourceLinkProps {
  isWidening: boolean;
  widenError: string | null;
  pane: ShiftablePane;
  onWiden: () => void;
  onDismissError: () => void;
}

function WidenSourceLink({
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

function ApplyingScrim({ pane }: { pane: ShiftablePane }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Shifting ${pane} clip, please wait`}
      className="absolute inset-0 z-10 bg-black/50 flex flex-col justify-end"
    >
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
  pane: ShiftablePane;
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
          aria-label={`Retry shift on ${pane} clip`}
          className="inline-flex items-center gap-1 text-[11px] text-white/80 hover:text-white underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          <RotateCcw className="w-3 h-3" aria-hidden />
          Retry
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel shift"
          className="text-[11px] text-white/60 hover:text-white/80 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded px-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
