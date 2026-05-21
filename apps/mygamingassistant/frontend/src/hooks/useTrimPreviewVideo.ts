/**
 * useTrimPreviewVideo — drive the in-panel preview video for the trim slider
 * (PR3, follow-up to PR2 trim).
 *
 * The hook owns a `<video>` element that the caller renders inside the trim
 * panel. It seeks the playhead deterministically based on the operator's drag
 * gesture so the operator sees the new in/out point WITHOUT shipping bytes:
 *
 *   - **Dragging start thumb**: video pauses, seeks to ``startOffsetS``. The
 *     operator sees a still of the proposed first frame.
 *   - **Dragging end thumb**:   video pauses, seeks to ``endOffsetS``. Still
 *     of the proposed last frame.
 *   - **Idle (no drag)**:       video plays a tight loop between
 *     ``startOffsetS`` and ``endOffsetS``. A ``timeupdate`` listener resets
 *     ``currentTime`` whenever it crosses ``endOffsetS``.
 *
 * The hook is a sibling of ``useClipDuration``: both encapsulate a single
 * `<video>` lifecycle for a single concern. ``useClipDuration`` probes
 * detached for metadata; this one drives a DOM-mounted element for visible
 * playback. They never share a video element — the trim panel mounts its own
 * so the underlying ``ClipView`` video isn't perturbed.
 *
 * No throttle on ``currentTime`` writes — modern browsers handle short muted
 * MP4s without stutter at typical pointermove rates. The ``isSeeking`` flag
 * lets the panel dim the video while the browser is mid-seek, which doubles
 * as a natural perceptual brake on fast drags.
 */
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

export type TrimPreviewThumb = "start" | "end" | null;

interface UseTrimPreviewVideoArgs {
  /** Presigned MinIO URL for the clip being trimmed. */
  clipUrl: string;
  /** Current start-offset in seconds (live from the trim state machine). */
  startOffsetS: number;
  /** Current end-offset in seconds. */
  endOffsetS: number;
  /** Which thumb (if any) the operator is currently dragging. ``null`` =
   *  idle, play the loop. */
  activeThumb: TrimPreviewThumb;
}

interface UseTrimPreviewVideoResult {
  /** Attach to the `<video>` element rendered inside the trim panel. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** True while the browser is mid-seek; the caller dims the video to
   *  signal "not ready" without obscuring the last-decoded frame. */
  isSeeking: boolean;
  /** True if the video failed to load (e.g., presigned URL rotated /
   *  expired). The trim panel stays operable — the operator can still
   *  Apply / Cancel without the preview. */
  hasError: boolean;
}

export function useTrimPreviewVideo({
  clipUrl,
  startOffsetS,
  endOffsetS,
  activeThumb,
}: UseTrimPreviewVideoArgs): UseTrimPreviewVideoResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hasError, setHasError] = useState(false);

  // ---------------------------------------------------------------------
  // Track seek state + error state for the lifetime of the video element.
  // Empty deps because videoRef.current is stable across renders.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onSeeking = () => setIsSeeking(true);
    const onSeeked = () => setIsSeeking(false);
    const onError = () => setHasError(true);

    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Reset error state whenever the URL rotates (presigned-URL refresh).
  // ---------------------------------------------------------------------
  useEffect(() => {
    setHasError(false);
  }, [clipUrl]);

  // ---------------------------------------------------------------------
  // Drag: snap to the active thumb's offset, pause. Re-runs on every drag
  // step (start/end offsets change as the operator drags).
  // ---------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeThumb === null) return;

    video.pause();
    video.currentTime = activeThumb === "start" ? startOffsetS : endOffsetS;
  }, [activeThumb, startOffsetS, endOffsetS]);

  // ---------------------------------------------------------------------
  // Idle: loop between [startOffsetS, endOffsetS]. Only active when no
  // thumb is being dragged. Restarts whenever the loop bounds change so
  // the operator sees the new range take effect on drag release.
  // ---------------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeThumb !== null) return;

    video.currentTime = startOffsetS;
    // Modern browsers return a Promise from play() that rejects when
    // autoplay is blocked. jsdom and some older runtimes return undefined.
    // Defensively handle both — the still at startOffsetS remains visible
    // either way, which is acceptable degradation when autoplay is
    // unavailable.
    try {
      const playResult = video.play() as Promise<void> | undefined;
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => {});
      }
    } catch {
      /* play() not implemented or threw synchronously */
    }

    const onTimeUpdate = () => {
      // ``timeupdate`` fires ~4x/sec, so the loop point can overshoot the
      // end by up to ~250ms before we wrap. Acceptable for a preview at
      // tile size. A finer loop would require requestAnimationFrame +
      // currentTime polling; deferred unless we get a UX complaint.
      if (video.currentTime >= endOffsetS) {
        video.currentTime = startOffsetS;
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.pause();
    };
  }, [activeThumb, startOffsetS, endOffsetS]);

  return { videoRef, isSeeking, hasError };
}
