import SavedSearchesSkeleton from "@/features/discover/SavedSearchesSkeleton";
import SavedSearchRow from "@/features/discover/SavedSearchRow";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";

interface SavedSearchesPanelProps {
  /** Called with a saved search's id when its refresh added postings, so the inbox polls while they're scored. */
  onRefreshed: (sourceId: string) => void;
}

export default function SavedSearchesPanel({ onRefreshed }: SavedSearchesPanelProps) {
  const { data: sources, isLoading, isError } = useListDiscoverySourcesQuery();

  if (isLoading) {
    return <SavedSearchesSkeleton />;
  }
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load saved searches — try refreshing the page.
      </p>
    );
  }
  if (!sources || sources.length === 0) {
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
