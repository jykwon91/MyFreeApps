import { useState } from "react";
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
import { refreshIntervalShortLabel } from "./refresh-interval";
import EditFrequencyPopover from "./EditFrequencyPopover";

interface SavedSearchRowProps {
  source: DiscoverySource;
}

export default function SavedSearchRow({ source }: SavedSearchRowProps) {
  const [refresh, { isLoading: isRefreshing }] = useRefreshDiscoverySourceMutation();
  const [deactivate, { isLoading: isDeactivating }] = useDeactivateDiscoverySourceMutation();
  const [isEditingFrequency, setIsEditingFrequency] = useState(false);

  const query = summarizeSearchQuery(source.config ?? {}, source.source);
  // Schedule line: "Refreshes every 6h — last fetched 2h ago" (PR 5).
  // Each source has an APScheduler job firing on its
  // ``fetch_interval_minutes`` cadence. Surfacing the cadence here lets
  // the operator see at a glance how often the search runs and how
  // recent the last automatic run was.
  const cadence = refreshIntervalShortLabel(source.fetch_interval_minutes);
  const lastFetched = source.last_fetched_at
    ? `Refreshes ${cadence.toLowerCase()} — last fetched ${timeAgo(source.last_fetched_at)}`
    : `Refreshes ${cadence.toLowerCase()} — never fetched yet`;

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

  // When the operator has named this source, render the name as the primary
  // identifier and demote the source-kind badge to secondary. When no name
  // is set, the badge IS the primary identifier (existing UX).
  const hasName = source.name && source.name.length > 0;

  return (
    <Card className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {hasName ? (
              <>
                <span className="font-medium truncate text-sm">{source.name}</span>
                <Badge label={getSourceLabel(source.source)} color={getSourceBadgeColor(source.source)} />
              </>
            ) : (
              <>
                <Badge label={getSourceLabel(source.source)} color={getSourceBadgeColor(source.source)} />
                <span className="font-medium truncate text-sm">{query}</span>
              </>
            )}
            {isFailing && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive shrink-0">
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                Fetch failed
              </span>
            )}
          </div>
          {hasName && query && (
            <p className="text-xs text-muted-foreground mt-0.5">{query}</p>
          )}
          {/* Cadence text is a clickable button that opens the frequency editor.
              Per the PR 7 UX design: clicking the interval text is the affordance
              to edit frequency. This avoids adding a dedicated edit button that
              clutters the row for the rare-change case. */}
          <p className="text-xs text-muted-foreground mt-1">
            <button
              type="button"
              onClick={() => setIsEditingFrequency((v) => !v)}
              className="underline decoration-dotted underline-offset-2 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
              aria-label={`Edit refresh frequency (currently ${cadence})`}
              data-testid="cadence-edit-trigger"
            >
              {lastFetched}
            </button>
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
      </div>

      {/* Inline frequency editor — renders below the row content when open */}
      {isEditingFrequency && (
        <EditFrequencyPopover
          sourceId={source.id}
          currentIntervalMinutes={source.fetch_interval_minutes}
          onClose={() => setIsEditingFrequency(false)}
        />
      )}
    </Card>
  );
}
