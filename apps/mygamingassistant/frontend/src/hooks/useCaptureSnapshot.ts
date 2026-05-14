/**
 * useCaptureSnapshot — one-shot screen capture for the calibration UI.
 *
 * Calls `cv_capture_frame` via IPC, returns the base64-PNG plus dimensions.
 * Web build returns a deterministic "platform-not-supported" error so the
 * UI can render the same affordance both places.
 *
 * Why a dedicated hook (vs inline `invoke` calls): the region picker AND
 * the dot picker both need this exact dance, with the same error semantics
 * and the same loading state. One hook keeps the surface DRY.
 */
import { useCallback, useState } from "react";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type { CvCaptureFrameResult } from "@/types/desktop";

export interface UseCaptureSnapshot {
  /** True while a capture is in flight. */
  isLoading: boolean;
  /** Last captured snapshot, or null. */
  snapshot: CvCaptureFrameResult | null;
  /** Last capture error, or null. */
  error: string | null;
  /** Trigger a fresh capture. Resolves with the result OR rejects on failure. */
  capture: () => Promise<CvCaptureFrameResult>;
  /** Clear stored snapshot + error. */
  reset: () => void;
}

export function useCaptureSnapshot(): UseCaptureSnapshot {
  const [isLoading, setIsLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<CvCaptureFrameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<CvCaptureFrameResult> => {
    setError(null);
    setIsLoading(true);
    try {
      if (!isTauri()) {
        throw new Error("Capture is a desktop-only feature.");
      }
      const result = await invokeTauri<CvCaptureFrameResult>("cv_capture_frame");
      setSnapshot(result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSnapshot(null);
    setError(null);
  }, []);

  return { isLoading, snapshot, error, capture, reset };
}
