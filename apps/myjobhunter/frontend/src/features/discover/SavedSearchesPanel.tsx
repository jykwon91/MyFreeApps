import { RefreshCw, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  LoadingButton,
  showError,
  showSuccess,
  timeAgo,
  extractErrorMessage,
} from "@platform/ui";
import SavedSearchesSkeleton from "@/features/discover/SavedSearchesSkeleton";
import {
  useDeactivateDiscoverySourceMutation,
  useListDiscoverySourcesQuery,
  useRefreshDiscoverySourceMutation,
} from "@/store/discoverApi";
import type { DiscoverySource } from "@/types/discovery/discovery-source";
import { summarizeSearchQuery } from "./saved-search-summary";

export default function SavedSearchesPanel() {
  const { data: sources, isLoading } = useListDiscoverySourcesQuery();

  if (isLoading) {
    return <SavedSearchesSkeleton />;
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

function SavedSearchRow({ source }: { source: DiscoverySource }) {
  const [refresh, { isLoading: isRefreshing }] = useRefreshDiscoverySourceMutation();
  const [deactivate, { isLoading: isDeactivating }] = useDeactivateDiscoverySourceMutation();

  const query = summarizeSearchQuery(source.config ?? {});
  const lastFetched = source.last_fetched_at
    ? `Last fetched ${timeAgo(source.last_fetched_at)}`
    : "Never fetched";

  async function handleRefresh() {
    try {
      const result = await refresh(source.id).unwrap();
      if (result.status === "success") {
        showSuccess(
          `Fetched ${result.fetched_count} posting${
            result.fetched_count === 1 ? "" : "s"
          } (${result.new_count} new)`,
        );
      } else if (result.error_message) {
        showError(result.error_message);
      }
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Refresh failed");
    }
  }

  async function handleDeactivate() {
    try {
      await deactivate(source.id).unwrap();
      showSuccess("Saved search removed");
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't remove saved search");
    }
  }

  return (
    <Card className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge label={source.source} color="gray" />
          <span className="font-medium truncate text-sm">{query}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {lastFetched}
          {source.last_error_message ? ` — error: ${source.last_error_message}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <LoadingButton
          size="sm"
          variant="secondary"
          isLoading={isRefreshing}
          loadingText="Fetching…"
          onClick={handleRefresh}
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </LoadingButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDeactivate}
          disabled={isDeactivating}
          aria-label="Remove saved search"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
