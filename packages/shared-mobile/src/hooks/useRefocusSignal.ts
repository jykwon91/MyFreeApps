import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

/** Counts each time the screen comes back into focus, not the first, e.g. to reload after a pushed screen changed things. */
export function useRefocusSignal(): number {
  const [signal, setSignal] = useState(0);
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (!isFirstFocus.current) setSignal((current) => current + 1);
      isFirstFocus.current = false;
    }, []),
  );

  return signal;
}
