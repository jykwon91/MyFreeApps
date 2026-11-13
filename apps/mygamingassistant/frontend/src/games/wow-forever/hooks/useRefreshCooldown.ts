import { useCallback, useEffect, useState } from "react";
import { cooldownLeftMs } from "@/games/wow-forever/lib/refreshCooldown";

interface RefreshCooldown {
  /** Milliseconds until "Refresh now" works again; 0 when it does. */
  cooldownLeft: number;
  /** The clock the cooldown was last measured against, in epoch ms. */
  nowMs: number;
  /** Re-read the clock, e.g. when the server has just stamped a new cooldown. */
  syncClock: () => void;
}

/**
 * The time left on a "Refresh now" cooldown, from the server's `available at` time. Re-renders
 * when the cooldown runs out, so the button comes back on its own.
 */
export function useRefreshCooldown(availableAt: string | null): RefreshCooldown {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const syncClock = useCallback(() => setNowMs(Date.now()), []);

  useEffect(() => {
    if (availableAt === null) return undefined;
    const wait = cooldownLeftMs(availableAt, Date.now());
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setNowMs(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [availableAt]);

  return { cooldownLeft: cooldownLeftMs(availableAt, nowMs), nowMs, syncClock };
}
