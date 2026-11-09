import { Plus } from "lucide-react";
import { Button } from "@platform/ui";
import { LISTING_MESSAGES } from "@/shared/lib/listing-messages";
import type { ListLoadMode } from "@/shared/types/list-load-mode";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import ChannelListingRow from "./ChannelListingRow";

export interface ChannelListingsBodyProps {
  mode: ListLoadMode;
  channelListings: ChannelListing[];
  canWrite: boolean;
  /** At least one channel exists to link, so the first-link CTA can open the form. */
  canAddFirst: boolean;
  removingId: string | null;
  onAdd: () => void;
  onEdit: (channelListing: ChannelListing) => void;
  onRemove: (channelListing: ChannelListing) => void;
}

export default function ChannelListingsBody({
  mode,
  channelListings,
  canWrite,
  canAddFirst,
  removingId,
  onAdd,
  onEdit,
  onRemove,
}: ChannelListingsBodyProps) {
  switch (mode) {
    case "loading":
    case "error":
      // ChannelsSection shows its skeleton or its LoadErrorAlert instead.
      return null;
    case "empty":
      return (
        <div
          data-testid="channels-section-empty-state"
          className="border-2 border-dashed rounded-lg p-6 text-center space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            {canWrite ? LISTING_MESSAGES.noChannels : LISTING_MESSAGES.noChannelsViewer}
          </p>
          {canWrite && canAddFirst ? (
            <Button
              variant="primary"
              size="md"
              onClick={onAdd}
              data-testid="channels-section-add-cta"
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              Add your first channel
            </Button>
          ) : null}
        </div>
      );
    case "list":
      return (
        <ul className="space-y-2" data-testid="channel-listings-list">
          {channelListings.map((cl) => (
            <ChannelListingRow
              key={cl.id}
              channelListing={cl}
              onEdit={() => onEdit(cl)}
              onRemove={() => onRemove(cl)}
              isRemoving={removingId === cl.id}
              canWrite={canWrite}
            />
          ))}
        </ul>
      );
  }
}
