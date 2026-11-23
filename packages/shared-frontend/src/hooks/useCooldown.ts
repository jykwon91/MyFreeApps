import { useCallback, useEffect, useRef, useState } from "react";

export interface Cooldown {
  /** Whole seconds left; 0 when no cooldown is running. */
  secondsLeft: number;
  /** Starts (or restarts) the countdown from `seconds`. */
  start: (seconds: number) => void;
}

/** A countdown in whole seconds, for locking a button after a too-many-attempts answer. */
export function useCooldown(): Cooldown {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (seconds: number) => {
      stop();
      setSecondsLeft(seconds);
      timer.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            stop();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    },
    [stop],
  );

  return { secondsLeft, start };
}
