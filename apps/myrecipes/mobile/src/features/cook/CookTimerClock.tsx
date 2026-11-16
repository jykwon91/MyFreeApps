import type { ReactNode } from "react";
import { useTicker } from "../../hooks/useTicker";
import type { CookTimer } from "../../types/CookTimer";
import { CookNowContext } from "./CookNowContext";
import { useTimerDoneAnnouncement } from "./useTimerDoneAnnouncement";

/**
 * Ticks while a timer runs and says when one finishes. Each tick re-renders only what reads
 * useCookNow: `children` is the same element from the screen, so React skips the rest.
 */
export default function CookTimerClock({ children, timers }: { children: ReactNode; timers: CookTimer[] }) {
  const now = useTicker(timers.length > 0 ? Math.max(...timers.map((timer) => timer.endsAt)) : null);
  useTimerDoneAnnouncement(timers, now);
  return <CookNowContext.Provider value={now}>{children}</CookNowContext.Provider>;
}
