import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

export interface SavedSearchRowProps {
  source: DiscoverySource;
  onEdit: (source: DiscoverySource) => void;
  /** Called with the saved search's id when a refresh added postings, so the inbox polls while they're scored. */
  onRefreshed: (sourceId: string) => void;
}
