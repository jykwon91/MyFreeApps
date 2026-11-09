import { useEffect, useState } from "react";
import { POLL_GIVE_UP_MS, POLL_INTERVAL_MS } from "../../constants/documents";
import { useScreenFocused } from "../../lib/useScreenFocused";

/** Polls while the screen is showing something still being read, for a limited time. */
export function useProcessingPoll(isProcessing: boolean): { pollingInterval: number; gaveUp: boolean } {
  const isFocused = useScreenFocused();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!isProcessing || !isFocused) return;
    const timer = setTimeout(() => setGaveUp(true), POLL_GIVE_UP_MS);
    return () => {
      clearTimeout(timer);
      setGaveUp(false);
    };
  }, [isProcessing, isFocused]);

  return { pollingInterval: isProcessing && isFocused && !gaveUp ? POLL_INTERVAL_MS : 0, gaveUp: isProcessing && gaveUp };
}
