import { useCallback, useRef } from "react";

/**
 * Wraps a submit so a second call made while the first is still running is ignored. A ref, not
 * React state like `isSaving`, holds the guard: state only changes on the next render, so two taps
 * or Enter presses in the same moment would both get through. The guard is released when the call
 * settles, so a failed submit can be tried again. An ignored call resolves with `undefined`.
 */
export function useSubmitOnce(): <T>(submit: () => Promise<T>) => Promise<T | undefined> {
  const isRunning = useRef(false);

  return useCallback(async <T>(submit: () => Promise<T>): Promise<T | undefined> => {
    if (isRunning.current) return undefined;
    isRunning.current = true;
    try {
      return await submit();
    } finally {
      isRunning.current = false;
    }
  }, []);
}
