import { useEffect, useState } from "react";
import { msUntilLongRunning } from "../utils/msUntilLongRunning";

/** `startedAt` if that analysis is already slow at `now`, else null. */
function slowAlready(startedAt: number | null, now: number): number | null {
  return startedAt !== null && msUntilLongRunning(startedAt, now) === 0 ? startedAt : null;
}

/**
 * Whether the analysis sent at `startedAt` has been running long enough for the "longer than usual"
 * copy. Counts from when it was sent, so a page opened mid-wait says so at the right time, and one
 * opened after that says it straight away rather than first showing (and announcing) the usual copy.
 */
export function useIsLongRunning(startedAt: number | null): boolean {
  const [slowSince, setSlowSince] = useState<number | null>(() => slowAlready(startedAt, Date.now()));
  useEffect(() => {
    if (startedAt === null) return;
    const timer = setTimeout(() => setSlowSince(startedAt), msUntilLongRunning(startedAt, Date.now()));
    return () => clearTimeout(timer);
  }, [startedAt]);
  return startedAt !== null && slowSince === startedAt;
}
