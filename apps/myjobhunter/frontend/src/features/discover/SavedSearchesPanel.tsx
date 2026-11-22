import ListLoadError from "@/components/ListLoadError";
import { SAVED_SEARCHES_LIST_MESSAGES as MESSAGES } from "@/constants/saved-searches-list-messages";
import SavedSearchesSkeleton from "@/features/discover/SavedSearchesSkeleton";
import SavedSearchRow from "@/features/discover/SavedSearchRow";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";

interface SavedSearchesPanelProps {
  /** Called with a saved search's id when its refresh added postings, so the inbox polls while they're scored. */
  onRefreshed: (sourceId: string) => void;
}

export default function SavedSearchesPanel({ onRefreshed }: SavedSearchesPanelProps) {
  const { data: sources, isError, refetch } = useListDiscoverySourcesQuery();

  // A refetch that fails keeps the rows already loaded; the error is only for when there is nothing to show.
  if (sources === undefined) {
    return isError ? (
      <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.retry} onRetry={refetch} />
    ) : (
      <SavedSearchesSkeleton />
    );
  }
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Saved searches
      </h2>
      {sources.map((source) => (
        <SavedSearchRow key={source.id} onRefreshed={onRefreshed} source={source} />
      ))}
    </div>
  );
}
