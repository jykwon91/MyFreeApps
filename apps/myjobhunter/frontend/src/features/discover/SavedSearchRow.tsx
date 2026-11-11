import { useState } from "react";
import { AlertTriangle, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, Card, LoadingButton, showError, showSuccess } from "@platform/ui";
import {
  useDeactivateDiscoverySourceMutation,
  useRefreshDiscoverySourceMutation,
} from "@myjobhunter/api-client/store/discoverApi";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import { describeRefreshError } from "@myjobhunter/api-client/utils/describeRefreshError";
import { describeRefreshResult } from "@myjobhunter/api-client/utils/describeRefreshResult";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { discoverySourceLabel } from "@myjobhunter/api-client/utils/discoverySourceLabel";
import { discoverySourceTone } from "@myjobhunter/api-client/utils/discoverySourceTone";
import { refreshIntervalShortLabel } from "@myjobhunter/api-client/utils/refreshIntervalShortLabel";
import { savedSearchCadence } from "@myjobhunter/api-client/utils/savedSearchCadence";
import { summarizeSearchQuery } from "@myjobhunter/api-client/utils/summarizeSearchQuery";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import EditFrequencyPopover from "./EditFrequencyPopover";
import EditSavedSearchDialog from "./EditSavedSearchDialog";

interface SavedSearchRowProps {
  source: DiscoverySource;
  /** Called with this saved search's id when a refresh added postings, so the inbox polls while they're scored. */
  onRefreshed: (sourceId: string) => void;
}

export default function SavedSearchRow({ source, onRefreshed }: SavedSearchRowProps) {
  const [refresh, { isLoading: isRefreshing }] = useRefreshDiscoverySourceMutation();
  const [deactivate, { isLoading: isDeactivating }] = useDeactivateDiscoverySourceMutation();
  const [isEditingFrequency, setIsEditingFrequency] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const query = summarizeSearchQuery(source.config ?? {}, source.source);
  // Schedule line: "Refreshes every 6h — last fetched 2h ago" (PR 5).
  // Each source has an APScheduler job firing on its
  // ``fetch_interval_minutes`` cadence. Surfacing the cadence here lets
  // the operator see at a glance how often the search runs and how
  // recent the last automatic run was.
  const cadence = refreshIntervalShortLabel(source.fetch_interval_minutes);
  const lastFetched = savedSearchCadence(source);

  async function handleRefresh() {
    try {
      const { message, isError, addedPostings } = describeRefreshResult(await refresh(source.id).unwrap());
      if (isError) showError(message);
      else showSuccess(message);
      if (addedPostings) onRefreshed(source.id);
    } catch (err) {
      showError(describeRefreshError(err));
    }
  }

  async function handleDeactivate() {
    try {
      await deactivate(source.id).unwrap();
      showSuccess(DISCOVER_ACTION_MESSAGES.removed);
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.removeFailed));
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
                <Badge label={discoverySourceLabel(source.source)} color={STATUS_TONE_BADGE_COLORS[discoverySourceTone(source.source)]} />
              </>
            ) : (
              <>
                <Badge label={discoverySourceLabel(source.source)} color={STATUS_TONE_BADGE_COLORS[discoverySourceTone(source.source)]} />
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
            onClick={() => setIsEditDialogOpen(true)}
            aria-label="Edit saved search"
            data-testid="edit-source-btn"
          >
            <Pencil className="w-4 h-4" />
          </Button>
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

      {/* Inline frequency editor — renders below the row content when open.
          Preserved as a quick path for cadence-only changes. The full
          EditSavedSearchDialog is the path for config edits. */}
      {isEditingFrequency && (
        <EditFrequencyPopover
          sourceId={source.id}
          currentIntervalMinutes={source.fetch_interval_minutes}
          onClose={() => setIsEditingFrequency(false)}
        />
      )}

      {/* Full edit dialog — source kind locked; all other fields editable.
          Mounted only while open so each opening starts from the saved row,
          not from a cancelled edit or a cadence changed since. */}
      {isEditDialogOpen && (
        <EditSavedSearchDialog
          source={source}
          open
          onClose={() => setIsEditDialogOpen(false)}
        />
      )}
    </Card>
  );
}
