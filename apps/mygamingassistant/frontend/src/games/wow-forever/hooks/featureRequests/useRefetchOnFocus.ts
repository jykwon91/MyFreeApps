import { useEffect } from "react";

/**
 * Re-read when the player comes back to the tab, so vote counts and statuses stay current. (RTK Query's
 * own refetchOnFocus needs app-wide `setupListeners`, which this app doesn't install.)
 */
export function useRefetchOnFocus(refetch: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    function onVisible(): void {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch, enabled]);
}
