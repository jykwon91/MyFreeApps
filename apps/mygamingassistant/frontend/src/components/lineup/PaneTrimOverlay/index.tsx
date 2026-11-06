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
import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors } from "lucide-react";

import { useClipDuration } from "@/hooks/useClipDuration";
import {
  usePaneTrim,
  type TrimmablePane,
} from "@/hooks/usePaneTrim";
import {
  useLazyGetLineupAdminQuery,
  useWidenPaneSourceMutation,
} from "@/store/lineupsApi";
import TrimSliderPanel from "./TrimSliderPanel";
import ApplyingScrim from "./ApplyingScrim";
import ErrorScrim from "./ErrorScrim";

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

  // Clear awaitingOpen once phase transitions out of "closed" (i.e., once open() was called).
  // Uses setState-during-render (React-idiomatic getDerivedStateFromProps equivalent) so
  // the effect body only calls open() with no setState.
  if (phase.phase !== "closed" && awaitingOpen) {
    setAwaitingOpen(false);
  }
  const storedOffsets = resolveStoredOffsets(adminLineup, pane);
  // YouTube anchor: the admin payload carries the source-video id + chapter
  // marker so the Trim slider can expose the "Widen source" affordance. Both
  // are null on manual-upload lineups (no YouTube source → no widen possible,
  // no chapter to anchor on).
  const youtubeVideoId = adminLineup?.youtube_video_id ?? null;
  // Where ``sourceUrl`` (the wider clip) starts in the source-video timeline.
  // Comes straight from the admin payload — backend computes
  // ``max(0, chapter_start - settings.clip_source_pre_seconds)`` so the value
  // matches the bounds the cut helper used. The slider's offset=0 maps to
  // this in-video timestamp, NOT to ``chapter_start_seconds`` (the
  // pre-PR-fix bug). Null when the wider source doesn't exist (manual upload,
  // missing chapter anchor, legacy ``tight == wide`` row) — the readout then
  // falls back to seconds-into-source.
  const sourceStartInVideoS = resolveSourceStartInVideoS(adminLineup, pane);

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
        sourceStartInVideoS={sourceStartInVideoS}
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

// Where the wider source clip starts in the source-video timeline (seconds).
// Backend computes this as ``max(0, chapter_start - settings.clip_source_pre_seconds)``
// so the readout can render absolute in-video timestamps without the drift the
// pre-fix version had (which used chapter_start_seconds as the anchor — off by
// the full pre-padding amount, hiding the wider source's leading padding from
// the operator's view).
function resolveSourceStartInVideoS(
  admin: {
    clip_source_start_in_video_s: number | null;
    landing_clip_source_start_in_video_s: number | null;
  } | null,
  pane: TrimmablePane,
): number | null {
  if (!admin) return null;
  return pane === "throw"
    ? admin.clip_source_start_in_video_s
    : admin.landing_clip_source_start_in_video_s;
}

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown } };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
}
