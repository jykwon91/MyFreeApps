import { CADENCE_MESSAGES } from "../constants/discoverMessages";
import type { DiscoverySource } from "../types/discovery/discovery-source";
import { refreshIntervalShortLabel } from "./refreshIntervalShortLabel";
import { timeAgo } from "@platform/core/utils/timeAgo";

/** A saved search's schedule line: "Refreshes daily — last fetched 2 hours ago". */
export function savedSearchCadence(source: DiscoverySource): string {
  const cadence = refreshIntervalShortLabel(source.fetch_interval_minutes);
  return source.last_fetched_at ? CADENCE_MESSAGES.lastFetched(cadence, timeAgo(source.last_fetched_at)) : CADENCE_MESSAGES.neverFetched(cadence);
}
