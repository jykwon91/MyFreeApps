/**
 * usePaneWindowShift — per-pane STAND/AIM shift-window flow.
 *
 * Sibling of ``usePaneTrim`` (PR2) — same four-state machine shape, but the
 * served micro-clip width is FIXED at 1 second, so the operator only chooses
 * where the window STARTS inside the shared wider source ``clip_url_original``.
 * One offset (vs the start/end pair throw/landing use); single-thumb scrubber
 * (vs PaneRangeScrubber's two-thumb range).
 *
 * State machine:
 *
 *   { phase: "closed" }                                — scissors visible
 *   { phase: "open", offsetS, sourceDurationS }        — slider visible
 *   { phase: "applying", offsetS }                     — server is cutting
 *   { phase: "error", message, offsetS }               — apply failed; retry
 *
 * Apply transitions back to ``closed`` after RTK Query invalidation; the
 * pane re-renders with the shifted clip on its own.
 */
import { useCallback, useState } from "react";

import { useShiftPaneWindowMutation } from "@/store/lineupsApi";

export type ShiftablePane = "stand" | "aim";

/** Frozen design contract — mirrors backend
 *  ``app.schemas.game.pane_shift_window_schemas.MICRO_CLIP_DURATION_S``
 *  AND ``app.services.ingestion.micro_clip_generator._MICRO_CLIP_SECONDS``.
 *  Changing this in one place without the others would silently break the
 *  upper-bound clamp on the slider OR the ffmpeg cut width. */
export const MICRO_CLIP_DURATION_S = 1.0;

export type PaneWindowShiftPhase =
  | { phase: "closed" }
  | { phase: "open"; offsetS: number; sourceDurationS: number }
  | { phase: "applying"; offsetS: number }
  | { phase: "error"; message: string; offsetS: number };

interface UsePaneWindowShiftArgs {
  lineupId: string;
  pane: ShiftablePane;
}

export function usePaneWindowShift({ lineupId, pane }: UsePaneWindowShiftArgs) {
  const [phase, setPhase] = useState<PaneWindowShiftPhase>({ phase: "closed" });
  const [shiftPane] = useShiftPaneWindowMutation();

  const open = useCallback(
    (sourceDurationS: number, initialOffsetS: number | null) => {
      // Pre-fill the slider thumb to the persisted offset when the row has
      // one (PR1 ingest path + PR2 prior saves). NULL falls back to 0 —
      // the operator hasn't shifted yet, so "start of source" is the most
      // honest default. Re-clamp defensively: a stored offset from before
      // a widen-source-shrink (settings drift) shouldn't crash the slider.
      const maxOffset = Math.max(0, sourceDurationS - MICRO_CLIP_DURATION_S);
      const initOffset =
        initialOffsetS != null && Number.isFinite(initialOffsetS)
          ? Math.max(0, Math.min(initialOffsetS, maxOffset))
          : 0;
      setPhase({ phase: "open", offsetS: initOffset, sourceDurationS });
    },
    [],
  );

  const updateOffset = useCallback((offsetS: number) => {
    setPhase((prev) => {
      if (prev.phase !== "open") return prev;
      const maxOffset = Math.max(
        0,
        prev.sourceDurationS - MICRO_CLIP_DURATION_S,
      );
      const clamped = Math.max(0, Math.min(offsetS, maxOffset));
      return { ...prev, offsetS: clamped };
    });
  }, []);

  const close = useCallback(() => {
    setPhase({ phase: "closed" });
  }, []);

  // Internal: POST the shift and drive the success / error transitions.
  // Used by both ``apply`` (from open state) and ``retry`` (from error
  // state). Caller has already moved the phase to ``applying`` with this
  // offset.
  const doShift = useCallback(
    async (offsetS: number) => {
      try {
        await shiftPane({
          lineup_id: lineupId,
          pane,
          offset_s: offsetS,
        }).unwrap();
        // RTK Query invalidation re-fetches the lineup; the pane re-
        // renders with the shifted clip. Close the slider so the operator
        // sees the result rather than the now-stale slider state.
        setPhase({ phase: "closed" });
      } catch (err) {
        setPhase({
          phase: "error",
          message: extractError(err) ?? "Could not shift micro-clip window",
          offsetS,
        });
      }
    },
    [lineupId, pane, shiftPane],
  );

  const apply = useCallback(() => {
    setPhase((prev) => {
      if (prev.phase !== "open") return prev;
      // Fire the request after the state transition commits; React calls
      // this updater pure-functionally, so we schedule the side effect on
      // the microtask queue rather than calling it synchronously inside.
      queueMicrotask(() => void doShift(prev.offsetS));
      return { phase: "applying", offsetS: prev.offsetS };
    });
  }, [doShift]);

  const retry = useCallback(() => {
    setPhase((prev) => {
      if (prev.phase !== "error") return prev;
      queueMicrotask(() => void doShift(prev.offsetS));
      return { phase: "applying", offsetS: prev.offsetS };
    });
  }, [doShift]);

  return { phase, open, close, updateOffset, apply, retry };
}

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown } };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
}
