import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
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
import {
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
} from "@/store/discoverApi";
import type { DiscoverySource } from "@/types/discovery/discovery-source";
import { summarizeSearchQuery, getSourceLabel, getSourceBadgeColor } from "./saved-search-summary";

interface SavedSearchRowProps {
  source: DiscoverySource;
}

export default function SavedSearchRow({ source }: SavedSearchRowProps) {
  const [refresh, { isLoading: isRefreshing }] = useRefreshDiscoverySourceMutation();
  const [deactivate, { isLoading: isDeactivating }] = useDeactivateDiscoverySourceMutation();

  const query = summarizeSearchQuery(source.config ?? {}, source.source);
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

  const isFailing = source.consecutive_failures > 0;

  return (
    <Card className="p-3 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge label={getSourceLabel(source.source)} color={getSourceBadgeColor(source.source)} />
          <span className="font-medium truncate text-sm">{query}</span>
          {isFailing && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive shrink-0">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              Fetch failed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {lastFetched}
          {source.last_error_message ? ` — ${source.last_error_message}` : ""}
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
