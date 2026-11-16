import { useRef } from "react";
import type { AfterSheetCloses } from "../../types/AfterSheetCloses";

/**
 * Leaves a sheet for another screen only once it has finished closing: a screen opened while
 * it's still up opens underneath it on iOS. `onClosed` runs when nothing was waiting.
 */
export function useAfterSheetCloses(close: () => void, onClosed?: () => void): AfterSheetCloses {
  const waiting = useRef<(() => void) | null>(null);
  return {
    closeThen(action) {
      waiting.current = action;
      close();
    },
    handleClosed() {
      const action = waiting.current;
      waiting.current = null;
      if (action) action();
      else onClosed?.();
    },
  };
}
