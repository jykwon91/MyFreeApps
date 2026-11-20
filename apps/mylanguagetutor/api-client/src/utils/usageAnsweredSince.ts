import type { UsageRequestState } from "../types/session/usage-request-state";

/**
 * Has a usage request sent at or after ``since`` (ms since the epoch) come back with an answer?
 * A refetch still running, or one that failed, leaves only an older answer.
 */
export function usageAnsweredSince(usage: UsageRequestState, since: number): boolean {
  return usage.isSuccess && !usage.isFetching && usage.startedTimeStamp !== undefined && usage.startedTimeStamp >= since;
}
