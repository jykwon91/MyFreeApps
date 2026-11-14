import { useState } from "react";

/**
 * Whether the image at `src` failed to load, and the handler to pass as its `onError`. Keyed by `src`, so a new
 * image (another character) gets a fresh try.
 */
export function useImageFailed(src: string): { failed: boolean; onError: () => void } {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return { failed: failedSrc === src, onError: () => setFailedSrc(src) };
}
