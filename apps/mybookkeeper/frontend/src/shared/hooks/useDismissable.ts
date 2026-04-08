import { useState, useCallback } from "react";

/**
 * Hook for info banners that can be dismissed and persist their dismissed state
 * in localStorage. Used across pages (Documents, Integrations, Analytics, etc.)
 * to avoid duplicating the same pattern 9 times.
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
