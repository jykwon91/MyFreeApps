import { useEffect, useState } from "react";

const TICK_MS = 1000;

/** Whole seconds left until `untilMs` (epoch ms), ticking down; 0 when it's passed or null. */
export function useCountdown(untilMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (untilMs === null) return undefined;
    const tick = () => setNow(Date.now());
    // Re-read the clock as soon as a deadline arrives — `now` may date from when the screen mounted.
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [untilMs]);
  if (untilMs === null) return 0;
  return Math.max(0, Math.ceil((untilMs - now) / 1000));
}
