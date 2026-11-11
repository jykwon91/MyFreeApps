import { REFRESH_MESSAGES } from "../constants/discoverMessages";
import type { DiscoveryFetchResult } from "../types/discovery/discovery-fetch-result";
import type { RefreshOutcome } from "../types/discovery/refresh-outcome";

/**
 * What to say after a refresh answered. A fetch that hit a problem says what it was; one that
 * failed without saying why still says it failed; anything else reports what it fetched.
 */
export function describeRefreshResult(result: DiscoveryFetchResult): RefreshOutcome {
  const addedPostings = result.new_count > 0;
  if (result.status !== "success" && result.error_message) return { message: result.error_message, isError: true, addedPostings };
  if (result.status === "error") return { message: REFRESH_MESSAGES.failed, isError: true, addedPostings };
  return { message: REFRESH_MESSAGES.fetched(result.fetched_count, result.new_count), isError: false, addedPostings };
}
