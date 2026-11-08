import { useEffect, useState } from "react";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";

/** True once an answer has taken longer than `ASK_LIMITS.stillWorkingMs`; false while idle. */
export function useStillWorking(busySince: number | null): boolean {
  const [lateFor, setLateFor] = useState<number | null>(null);
  useEffect(() => {
    if (busySince === null) return;
    const wait = Math.max(0, busySince + ASK_LIMITS.stillWorkingMs - Date.now());
    const timer = window.setTimeout(() => setLateFor(busySince), wait);
    return () => window.clearTimeout(timer);
  }, [busySince]);
  return busySince !== null && lateFor === busySince;
}
