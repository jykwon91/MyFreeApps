import { useCallback, useEffect, useRef, useState } from "react";
import { cooldownLeftMs } from "@/games/wow-forever/lib/refreshCooldown";

/** The "you can refresh again in N minutes" text counts down by the minute. */
const COOLDOWN_TICK_MS = 60_000;
const MS_PER_SECOND = 1_000;

interface RefreshCooldown {
  /** Milliseconds until "Refresh now" works again; 0 when it does. */
  cooldownLeft: number;
  /** The clock the cooldown was last measured against, in epoch ms. */
  nowMs: number;
  /** Re-read the clock, e.g. when the server has just stamped a new cooldown. */
  syncClock: () => void;
  /**
   * The server said "too soon, try in N seconds": count that from now, on this device's own clock,
   * so a clock that disagrees with the server's can't show the wrong wait.
   */
  startCooldown: (seconds: number) => void;
}

/** A cooldown the server reported as "N seconds from now", good for as long as `availableAt` is unchanged. */
interface LocalCooldown {
  availableAt: string | null;
  endMs: number;
}

/**
 * The time left on a "Refresh now" cooldown, from the server's `available at` time. Re-renders
 * every minute while it runs and when it runs out, so the text counts down and the button comes
 * back on its own.
 */
export function useRefreshCooldown(availableAt: string | null): RefreshCooldown {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [local, setLocal] = useState<LocalCooldown | null>(null);
  const syncClock = useCallback(() => setNowMs(Date.now()), []);
  // The server's time as of now, not as of the click: another tab may have claimed in between.
  const latestAvailableAt = useRef(availableAt);
  useEffect(() => {
    latestAvailableAt.current = availableAt;
  });
  const startCooldown = useCallback((seconds: number) => {
    const now = Date.now();
    setNowMs(now);
    setLocal({ availableAt: latestAvailableAt.current, endMs: now + seconds * MS_PER_SECOND });
  }, []);

  const localEndMs = local !== null && local.availableAt === availableAt ? local.endMs : null;
  const cooldownLeft = localEndMs !== null ? Math.max(localEndMs - nowMs, 0) : cooldownLeftMs(availableAt, nowMs);
  const running = cooldownLeft > 0;

  useEffect(() => {
    if (!running) return undefined;
    const tick = window.setInterval(() => setNowMs(Date.now()), COOLDOWN_TICK_MS);
    return () => window.clearInterval(tick);
  }, [running]);

  useEffect(() => {
    const wait = localEndMs !== null ? localEndMs - Date.now() : cooldownLeftMs(availableAt, Date.now());
    if (wait <= 0) return undefined;
    const timer = window.setTimeout(() => setNowMs(Date.now()), wait);
    return () => window.clearTimeout(timer);
  }, [availableAt, localEndMs]);

  return { cooldownLeft, nowMs, syncClock, startCooldown };
}
