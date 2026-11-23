import { Telescope } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DISCOVER_EMPTY_STATES, DISCOVER_SHOW_ALL_SOURCES_LABEL } from "@myjobhunter/api-client/constants/discoverEmptyStates";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";

interface DiscoverEmptyStateProps {
  view: DiscoverView;
  /** A saved search is chosen: say so, and offer every saved search again. */
  isFiltered: boolean;
  /** Clears the saved-search filter. */
  onShowAllSources: () => void;
}

/** What a Discover tab says when it has no postings to show. */
export default function DiscoverEmptyState({ view, isFiltered, onShowAllSources }: DiscoverEmptyStateProps) {
  const { empty, emptyFiltered } = DISCOVER_EMPTY_STATES[view];
  const copy = isFiltered ? emptyFiltered : empty;
  return (
    <EmptyState
      icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
      heading={copy.heading}
      body={copy.body}
      action={isFiltered ? { label: DISCOVER_SHOW_ALL_SOURCES_LABEL, onClick: onShowAllSources } : undefined}
    />
  );
}
