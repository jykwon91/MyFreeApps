/**
 * usePaneTrim — per-pane clip-duration trim flow (PR2).
 *
 * Drives the four-state machine for the in-pane scissors-icon → range-slider
 * → ffmpeg re-encode → invalidation cycle:
 *
 *   { phase: "closed" }                                 — scissors visible
 *   { phase: "open", startOffsetS, endOffsetS, clipDurationS }
 *                                                       — slider visible
 *   { phase: "applying", startOffsetS, endOffsetS }     — server is cutting
 *   { phase: "error", message, startOffsetS, endOffsetS }
 *                                                       — apply failed; retryable
 *
 * Mirrors PR1's ``usePaneUpload`` discriminated-union shape so consumers can
 * destructure on ``phase.phase`` without runtime type guards. Apply transitions
 * back to ``closed`` after RTK Query invalidation; the pane re-renders with
 * the trimmed clip and the slider closes on its own.
 */
import { useCallback, useState } from "react";
import { useTrimPaneMutation } from "@/store/lineupsApi";

export type TrimmablePane = "throw" | "landing";

export type PaneTrimPhase =
  | { phase: "closed" }
  | {
      phase: "open";
      startOffsetS: number;
      endOffsetS: number;
      clipDurationS: number;
    }
  | { phase: "applying"; startOffsetS: number; endOffsetS: number }
  | {
      phase: "error";
      message: string;
      startOffsetS: number;
      endOffsetS: number;
    };

/** Operator-tunable floor; mirrors the server's MIN_TRIM_DURATION_S. */
export const MIN_TRIM_DURATION_S = 1.0;

interface UsePaneTrimArgs {
  lineupId: string;
  pane: TrimmablePane;
}

export function usePaneTrim({ lineupId, pane }: UsePaneTrimArgs) {
  const [phase, setPhase] = useState<PaneTrimPhase>({ phase: "closed" });
  const [trimPane] = useTrimPaneMutation();

  const open = useCallback(
    (
      clipDurationS: number,
      initial?: { startOffsetS: number; endOffsetS: number } | null,
    ) => {
      // Pre-fill thumbs to "where the operator currently is" inside the
      // source clip when prior trim offsets are known (PR4 — passed in from
      // the admin-shape lineup payload). Falls back to the full source range
      // when offsets are null/missing (untrimmed clip or legacy row).
      // Re-clamp defensively: a stored offset pair from an older trim that
      // exceeds the current source duration shouldn't crash the slider.
      const initStart =
        initial && Number.isFinite(initial.startOffsetS)
          ? Math.max(0, Math.min(initial.startOffsetS, clipDurationS))
          : 0;
      const initEnd =
        initial && Number.isFinite(initial.endOffsetS)
          ? Math.max(initStart, Math.min(initial.endOffsetS, clipDurationS))
          : clipDurationS;
      setPhase({
        phase: "open",
        startOffsetS: initStart,
        endOffsetS: initEnd,
        clipDurationS,
      });
    },
    [],
  );

  const updateRange = useCallback(
    (startOffsetS: number, endOffsetS: number) => {
      setPhase((prev) => {
        if (prev.phase !== "open") return prev;
        // Clamp to the slider's own bounds; the slider primitive guarantees
        // these are already valid, but the hook is the canonical source of
        // truth so we re-clamp defensively.
        const clipDur = prev.clipDurationS;
        const clampedStart = Math.max(0, Math.min(startOffsetS, clipDur));
        const clampedEnd = Math.max(clampedStart, Math.min(endOffsetS, clipDur));
        return { ...prev, startOffsetS: clampedStart, endOffsetS: clampedEnd };
      });
    },
    [],
  );

  const close = useCallback(() => {
    setPhase({ phase: "closed" });
  }, []);

  // Internal: POST the trim and drive the success / error transitions.
  // Used by both ``apply`` (from open state) and ``retry`` (from error state).
  // Caller has already moved the phase to ``applying`` with these offsets.
  const doTrim = useCallback(
    async (startOffsetS: number, endOffsetS: number) => {
      try {
        await trimPane({
          lineup_id: lineupId,
          pane,
          start_offset_s: startOffsetS,
          end_offset_s: endOffsetS,
        }).unwrap();
        // RTK Query invalidation re-fetches the lineup; the pane re-renders
        // with the trimmed clip. Close the slider so the operator sees the
        // result rather than the now-stale slider state.
        setPhase({ phase: "closed" });
      } catch (err) {
        setPhase({
          phase: "error",
          message: extractError(err) ?? "Could not trim clip",
          startOffsetS,
          endOffsetS,
        });
      }
    },
    [lineupId, pane, trimPane],
  );

  const apply = useCallback(() => {
    setPhase((prev) => {
      if (prev.phase !== "open") return prev;
      // Fire the request after the state transition commits; React calls
      // this updater pure-functionally, so we schedule the side effect on
      // the microtask queue rather than calling it synchronously inside.
      queueMicrotask(() => void doTrim(prev.startOffsetS, prev.endOffsetS));
      return {
        phase: "applying",
        startOffsetS: prev.startOffsetS,
        endOffsetS: prev.endOffsetS,
      };
    });
  }, [doTrim]);

  const retry = useCallback(() => {
    setPhase((prev) => {
      if (prev.phase !== "error") return prev;
      queueMicrotask(() => void doTrim(prev.startOffsetS, prev.endOffsetS));
      return {
        phase: "applying",
        startOffsetS: prev.startOffsetS,
        endOffsetS: prev.endOffsetS,
      };
    });
  }, [doTrim]);

  return { phase, open, close, updateRange, apply, retry };
}

function extractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const maybe = err as { data?: { detail?: unknown } };
  const detail = maybe.data?.detail;
  if (typeof detail === "string") return detail;
  return null;
}
