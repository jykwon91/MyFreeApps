import { useState } from "react";
import { Check, Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { showSuccess } from "@/shared/lib/toast-store";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";
import ChannelImportStatusBadge from "./ChannelImportStatusBadge";

interface Props {
  channelListing: ChannelListing;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving?: boolean;
}

/**
 * Single existing channel-listing row.
 *
 * Shows: channel name, "Open on channel" link, sync status, "Copy outbound
 * iCal URL" button, Edit + Remove inline actions. Mobile-first — every
 * interactive element is at least 44x44px touch target via `Button`.
 */
export default function ChannelListingRow({
  channelListing,
  onEdit,
  onRemove,
  isRemoving,
}: Props) {
  const [copied, setCopied] = useState(false);
  const channelName = channelListing.channel?.name ?? channelListing.channel_id;

  async function handleCopy() {
    await navigator.clipboard.writeText(channelListing.ical_export_url);
    setCopied(true);
    showSuccess("iCal URL copied. Paste it into the channel's import-calendar field.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li
      data-testid={`channel-listing-row-${channelListing.id}`}
      className="border rounded-lg p-3 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className="font-medium"
          data-testid={`channel-listing-name-${channelListing.id}`}
        >
          {channelName}
        </span>
        {channelListing.external_url ? (
          <a
            href={channelListing.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline min-h-[44px] px-1 text-xs"
            aria-label={`Open ${channelName} listing in new tab`}
            data-testid={`channel-listing-open-${channelListing.id}`}
          >
            Open on {channelName}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            data-testid={`channel-listing-copy-${channelListing.id}`}
            aria-label={`Copy outbound iCal URL for ${channelName}`}
          >
            {copied ? (
              <Check className="h-3 w-3 mr-1 text-green-600" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
            )}
            Copy iCal URL
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            data-testid={`channel-listing-edit-${channelListing.id}`}
            aria-label={`Edit ${channelName} channel link`}
          >
            <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRemove}
            disabled={isRemoving}
            data-testid={`channel-listing-remove-${channelListing.id}`}
            aria-label={`Remove ${channelName} channel link`}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ChannelImportStatusBadge channelListing={channelListing} />
        {channelListing.ical_import_url == null ? (
          <span className="text-xs text-muted-foreground italic">
            No inbound iCal URL set — bookings won't import automatically.
          </span>
        ) : null}
      </div>
    </li>
  );
}
