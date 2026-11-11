import { ANALYZE_LONG_RUNNING_MS } from "../constants/jobAnalysis";

/** How long until an analysis sent at `startedAt` counts as slow; 0 once it does. */
export function msUntilLongRunning(startedAt: number, now: number): number {
  return Math.max(0, startedAt + ANALYZE_LONG_RUNNING_MS - now);
}
