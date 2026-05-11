import SavedSearchesSkeleton from "@/features/discover/SavedSearchesSkeleton";
import SavedSearchRow from "@/features/discover/SavedSearchRow";
import { useListDiscoverySourcesQuery } from "@/store/discoverApi";

export default function SavedSearchesPanel() {
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
        <SavedSearchRow key={source.id} source={source} />
      ))}
    </div>
  );
}
