import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { POLL_GIVE_UP_MS, POLL_INTERVAL_MS } from "../../constants/documents";

/** Polls while the screen is showing something still being read, for a limited time. */
export function useProcessingPoll(isProcessing: boolean): { pollingInterval: number; gaveUp: boolean } {
  const [isFocused, setIsFocused] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

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
