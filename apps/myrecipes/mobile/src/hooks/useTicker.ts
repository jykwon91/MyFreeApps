import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** The time, updating each second until `until` and on return to the foreground. */
export function useTicker(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const isActive = until !== null && now < until;

  useEffect(() => {
    if (!isActive) return undefined;
    const tick = () => setNow(Date.now());
    // `now` may be long out of date by the time this becomes active.
    const catchUp = setTimeout(tick);
    const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tick();
    });
    return () => {
      clearTimeout(catchUp);
      clearInterval(interval);
      subscription.remove();
    };
  }, [isActive]);

  return now;
}
