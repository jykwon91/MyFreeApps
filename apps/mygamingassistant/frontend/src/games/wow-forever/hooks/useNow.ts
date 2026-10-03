import { useEffect, useState } from "react";

/** The clock, re-read every `intervalMs`, so relative times ("in 3 days") stay true while the page is open. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
