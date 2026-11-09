import { type Href, router } from "expo-router";
import { useEffect, useState } from "react";

/**
 * Goes back once `leave` is called. It waits a render, or the discard question still sees the
 * unsaved changes. A deep link has nothing to go back to, so it goes to `fallback`.
 */
export function useLeaveWhenSaved(fallback: Href) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!isLeaving) return;
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [isLeaving, fallback]);

  return { isLeaving, leave: () => setIsLeaving(true) };
}
