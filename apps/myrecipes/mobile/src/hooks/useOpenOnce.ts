import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/** Runs `open` once per visit to this screen, so two quick taps push one screen, not two. */
export function useOpenOnce<Args extends unknown[]>(open: (...args: Args) => void): (...args: Args) => void {
  const isOpening = useRef(false);

  useFocusEffect(
    useCallback(() => {
      isOpening.current = false;
    }, []),
  );

  return (...args: Args) => {
    if (isOpening.current) return;
    isOpening.current = true;
    open(...args);
  };
}
