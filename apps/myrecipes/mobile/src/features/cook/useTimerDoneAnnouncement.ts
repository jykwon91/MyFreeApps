import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import type { CookTimer } from "../../types/CookTimer";
import { formatTimerDuration } from "../../utils/formatCookTimer";

/** Says when a timer runs out while this is open, once each, and not for ones already done. */
export function useTimerDoneAnnouncement(timers: CookTimer[], now: number): void {
  const announced = useRef<Set<string> | null>(null);

  useEffect(() => {
    const isDone = (timer: CookTimer) => timer.endsAt <= now;
    const known = announced.current ?? new Set(timers.filter(isDone).map((timer) => timer.id));
    announced.current = known;
    for (const timer of timers.filter(isDone)) {
      if (!known.has(timer.id)) {
        known.add(timer.id);
        AccessibilityInfo.announceForAccessibility(
          `Step ${timer.stepNumber}, ${formatTimerDuration(timer.seconds)} timer is done`,
        );
      }
    }
    for (const id of known) {
      if (!timers.some((timer) => timer.id === id && timer.endsAt <= now)) known.delete(id);
    }
  }, [now, timers]);
}
