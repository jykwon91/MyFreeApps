import { useState, useCallback } from "react";

/**
 * Hook for info banners that can be dismissed and persist their dismissed state
 * in localStorage under the given key (value "1"). Shared by every app via
 * @platform/ui so dismissed tips stay dismissed.
 */
export function useDismissable(storageKey: string): {
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void;
} {
  const [dismissed, setDismissed] = useState<boolean>(
    () => localStorage.getItem(storageKey) === "1",
  );

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(storageKey, "1");
  }, [storageKey]);

  const reset = useCallback(() => {
    setDismissed(false);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { dismissed, dismiss, reset };
}
