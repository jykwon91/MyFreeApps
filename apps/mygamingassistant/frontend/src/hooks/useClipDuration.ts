/**
 * useClipDuration — probe the duration of an MP4 at a presigned MinIO URL.
 *
 * Mounts a detached ``<video>`` element with ``preload="metadata"`` so the
 * browser fetches only the moov atom (a few KB) rather than the full clip.
 * Resolves with the duration in seconds once the metadata event fires; nulls
 * out on src changes / unmount so callers don't act on a stale duration when
 * the underlying clip URL rotates.
 *
 * Used by ``PaneTrimOverlay`` to populate the upper bound of the range slider
 * without needing access to the visible ``<video>`` element rendered by
 * ``ClipView``. Keeping the probe self-contained means the trim overlay
 * doesn't have to thread refs through ClipView's existing forwardRef-free
 * signature — a meaningful simplification for PR2.
 */
import { useEffect, useState } from "react";

export function useClipDuration(clipUrl: string | null | undefined): number | null {
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!clipUrl) {
      setDuration(null);
      return;
    }

    // Detached <video> — never appended to the DOM. Browser still fetches
    // metadata when src is set + preload="metadata".
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;

    const handleLoaded = () => {
      // ``duration`` is Infinity for unknown-length streams and NaN before
      // metadata loads — only commit a finite, positive value.
      const d = probe.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
      }
    };
    const handleError = () => setDuration(null);

    probe.addEventListener("loadedmetadata", handleLoaded);
    probe.addEventListener("error", handleError);
    probe.src = clipUrl;

    return () => {
      probe.removeEventListener("loadedmetadata", handleLoaded);
      probe.removeEventListener("error", handleError);
      // Clearing the src + load() halts any in-flight fetch (matters when
      // the operator toggles the trim affordance rapidly).
      probe.removeAttribute("src");
      probe.load();
      setDuration(null);
    };
  }, [clipUrl]);

  return duration;
}
