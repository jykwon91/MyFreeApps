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
import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors } from "lucide-react";

import { useClipDuration } from "@/hooks/useClipDuration";
import {
  usePaneWindowShift,
  type ShiftablePane,
} from "@/hooks/usePaneWindowShift";
import {
  useLazyGetLineupAdminQuery,
  useWidenPaneSourceMutation,
} from "@/store/lineupsApi";
import ShiftSliderPanel from "./ShiftSliderPanel";
import ApplyingScrim from "./ApplyingScrim";
import ErrorScrim from "./ErrorScrim";

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

  // Clear awaitingOpen once phase transitions out of "closed" (i.e., once open() was called).
  // Uses setState-during-render (React-idiomatic getDerivedStateFromProps equivalent) so
  // the effect body only calls open() with no setState.
  if (phase.phase !== "closed" && awaitingOpen) {
    setAwaitingOpen(false);
  }

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
      open(0, null);
      return;
    }
    if (widerSourceDurationS == null) return;
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
