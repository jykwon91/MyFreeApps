import { useState, useCallback } from "react";

/**
 * Hook for info banners that can be dismissed and persist their dismissed state
 * in localStorage. Mirrors the same hook in packages/shared-frontend — not yet
 * exported from @platform/ui so this local copy is used instead.
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
