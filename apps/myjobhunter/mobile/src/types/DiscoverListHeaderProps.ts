import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";

export interface DiscoverListHeaderProps {
  sources: readonly DiscoverySource[] | undefined;
  areSourcesLoading: boolean;
  /** The saved searches couldn't load, and none loaded before. */
  isSourcesError: boolean;
  onRetrySources: () => Promise<void>;
  view: DiscoverView;
  onChangeView: (view: DiscoverView) => void;
  /** The chosen saved search's name, or "All". */
  sourceLabel: string;
  onChooseSource: () => void;
  onNewSavedSearch: () => void;
  onEditSavedSearch: (source: DiscoverySource) => void;
  /** Called with the saved search's id when a refresh added postings, so the inbox polls while they're scored. */
  onSavedSearchRefreshed: (sourceId: string) => void;
  /** The inbox's "Scored N of M" line, when there is one to show. */
  coverageLine: string | null;
  /** The postings shown were loaded earlier; the latest refetch failed. */
  isStale: boolean;
}
