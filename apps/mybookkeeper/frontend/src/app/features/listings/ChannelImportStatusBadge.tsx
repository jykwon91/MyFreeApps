import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { deriveImportStatus } from "@mybookkeeper/api-client/utils/channelImport";
import { timeSince } from "@platform/core/utils/timeSince";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";

export interface ChannelImportStatusBadgeProps {
  channelListing: ChannelListing;
}

/**
 * Inline status indicator for an inbound iCal sync.
 *
 * Renders a small icon + text pair so the operator can scan the channels
 * list and immediately see "OK / N minutes ago" or "Last error: ..." without
 * clicking into a row. Uses an icon AND color (never color alone) for
 * accessibility.
 */
export default function ChannelImportStatusBadge({ channelListing }: ChannelImportStatusBadgeProps) {
  const status = deriveImportStatus(channelListing);

  if (status === "pending") {
    return (
      <span
        data-testid={`channel-import-status-${channelListing.id}`}
        data-status="pending"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        Not synced yet
      </span>
    );
  }

  if (status === "error") {
    return (
      <span
        data-testid={`channel-import-status-${channelListing.id}`}
        data-status="error"
        className="inline-flex items-center gap-1 text-xs text-red-600"
        title={channelListing.last_import_error ?? undefined}
      >
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Last error: {(channelListing.last_import_error ?? "Sync failed").slice(0, 80)}
      </span>
    );
  }

  return (
    <span
      data-testid={`channel-import-status-${channelListing.id}`}
      data-status="ok"
      className="inline-flex items-center gap-1 text-xs text-green-700"
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Synced {channelListing.last_imported_at ? timeSince(channelListing.last_imported_at) : "recently"}
    </span>
  );
}
