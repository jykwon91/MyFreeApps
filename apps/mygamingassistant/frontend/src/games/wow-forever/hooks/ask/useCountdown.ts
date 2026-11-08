import { useEffect, useState } from "react";

const TICK_MS = 1000;

function secondsUntil(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / TICK_MS));
}

/** Whole seconds left of `seconds`, counted from when the hook mounted; 0 when there's nothing to wait for. */
export function useCountdown(seconds: number | null): number {
  const [deadline] = useState(() => (seconds === null ? 0 : Date.now() + seconds * TICK_MS));
  const [left, setLeft] = useState(() => secondsUntil(deadline));
  const waiting = left > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setLeft(secondsUntil(deadline)), TICK_MS / 4);
    return () => window.clearInterval(timer);
  }, [deadline, waiting]);
  return left;
}
