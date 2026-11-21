import { useEffect, useRef } from "react";
import { DAILY_RESET_MARGIN_MS } from "../constants/dailyReset";
import { nextUtcMidnight } from "../utils/nextUtcMidnight";

/**
 * While ``active``, runs ``onReset`` once the daily quota rolls over (00:00 UTC), so a daily-limit
 * notice that is still on screen lifts without the learner leaving and coming back. The timer is
 * cleared when ``active`` ends or the screen unmounts.
 */
export function useAtDailyReset(active: boolean, onReset: () => void): void {
  const latest = useRef(onReset);
  latest.current = onReset;

  useEffect(() => {
    if (!active) return;
    const delay = nextUtcMidnight(new Date()).getTime() - Date.now() + DAILY_RESET_MARGIN_MS;
    const timer = setTimeout(() => latest.current(), delay);
    return () => clearTimeout(timer);
  }, [active]);
}
