import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

export interface SavedSearchSheetProps {
  /** The saved search to edit; leave out to create one. */
  source?: DiscoverySource;
  onClose: () => void;
}
