import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

export interface DiscoveredJobCardProps {
  job: DiscoveredJob;
  /** Every saved search, to name the one the posting came from. */
  sources: readonly DiscoverySource[];
  /** When the profile last changed, to tell a score that will be redone. Null until it loads. */
  profileUpdatedAt: string | null;
  /** Only during the short window after a refresh, while fresh postings are being scored. */
  isScoringInFlight: boolean;
}
