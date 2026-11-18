import { useRef, useState } from "react";
import type { PendingPress } from "../types/PendingPress";
import type { PressHandler } from "../types/PressHandler";
import { isPromise } from "../utils/isPromise";

/**
 * Wraps a press handler so an async one reads as busy until it settles and can't be fired twice.
 * The caller decides what busy looks like.
 */
export function usePendingPress(onPress: PressHandler, isBlocked = false): PendingPress {
  const [isPending, setIsPending] = useState(false);
  // State only blocks a second press after a re-render. The ref blocks it immediately.
  const inFlight = useRef(false);

  const press = (): void => {
    if (inFlight.current || isBlocked) return;
    inFlight.current = true;
    let result: ReturnType<PressHandler>;
    try {
      result = onPress();
    } catch (error) {
      inFlight.current = false;
      throw error;
    }
    const isAsync = isPromise(result);
    if (isAsync) setIsPending(true);
    // Sync work settles on the next microtask, which still stops a second press in this tick.
    void Promise.resolve(result).finally(() => {
      inFlight.current = false;
      if (isAsync) setIsPending(false);
    });
  };

  return { isPending, press };
}
