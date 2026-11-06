import { useEffect, useState } from "react";
import { createDelayedActionQueue } from "@/games/wow-forever/lib/featureRequests/triage/delayedActionQueue";
import type { DelayedActionOptions } from "@/games/wow-forever/types/featureRequests/triage/delayedActionOptions";
import type { DelayedActionsState } from "@/games/wow-forever/types/featureRequests/triage/delayedActionsState";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

/**
 * Writes with an undo window (`createDelayedActionQueue`) for one screen. Anything still waiting is sent
 * straight away when the tab is hidden or closed (`visibilitychange` / `pagehide`) and when the screen
 * unmounts (navigation) — an approval is never lost by leaving.
 */
export function useDelayedAction({ delayMs, onSuccess, onFailure }: DelayedActionOptions): DelayedActionsState {
  const [pending, setPending] = useState<PendingDelayedAction[]>([]);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [queue] = useState(() => createDelayedActionQueue(delayMs));

  useEffect(() => {
    queue.setHandlers({ onChange: setPending, onSuccess, onFailure, onRateLimited: setRateLimitedUntil });
  }, [queue, onSuccess, onFailure]);

  useEffect(() => {
    const flushOnHide = () => void queue.flush(undefined, true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnHide();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushOnHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushOnHide);
      void queue.flush();
    };
  }, [queue]);

  return { pending, rateLimitedUntil, schedule: queue.schedule, undo: queue.undo, flush: queue.flush };
}
