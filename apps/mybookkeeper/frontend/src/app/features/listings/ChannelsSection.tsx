import { useState } from "react";
import { Plus } from "lucide-react";
import AlertBox from "@/shared/components/ui/AlertBox";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useDeleteChannelListingMutation,
  useGetChannelsQuery,
  useGetListingChannelsQuery,
} from "@/shared/store/listingsApi";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";
import ChannelListingRow from "./ChannelListingRow";
import ChannelListingFormModal from "./ChannelListingFormModal";

export interface ChannelsSectionProps {
  listingId: string;
}

type FormMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "edit"; channelListing: ChannelListing };

/**
 * "Channels" section on the listing detail page (PR 1.4).
 *
 * Owns the list / add-modal state. Lists existing channel_listings via
 * RTK Query (cache key per-listing); the "Add channel" button only
 * shows when there's at least one unlinked channel available. Empty
 * state pitches the operator on the first link.
 */
export default function ChannelsSection({ listingId }: ChannelsSectionProps) {
  const {
    data: channelListings = [],
    isLoading,
    isError,
    refetch,
  } = useGetListingChannelsQuery(listingId);
  const { data: channels = [] } = useGetChannelsQuery();
  const [deleteChannelListing] = useDeleteChannelListingMutation();

  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [removingId, setRemovingId] = useState<string | null>(null);

  const linkedChannelIds = new Set(channelListings.map((cl) => cl.channel_id));
  const availableChannels = channels.filter((c) => !linkedChannelIds.has(c.id));
  const allChannelsLinked =
    channels.length > 0 && availableChannels.length === 0;

  function handleAdd() {
    setFormMode({ kind: "create" });
  }

  function handleEdit(cl: ChannelListing) {
    setFormMode({ kind: "edit", channelListing: cl });
  }

  function handleClose() {
    setFormMode({ kind: "closed" });
  }

  async function handleRemove(cl: ChannelListing) {
    setRemovingId(cl.id);
    try {
      await deleteChannelListing({
        listingId,
        channelListingId: cl.id,
      }).unwrap();
      showSuccess(`${cl.channel?.name ?? "Channel"} link removed.`);
    } catch {
      showError("I couldn't remove that channel. Want me to try again?");
    } finally {
      setRemovingId(null);
    }
  }

  if (isLoading) {
    return (
      <div
        data-testid="channels-section-loading"
        className="space-y-2"
        aria-live="polite"
      >
        <div className="h-16 rounded-md bg-muted animate-pulse" />
        <div className="h-16 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>I couldn't load the channels for this listing.</span>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </AlertBox>
    );
  }

  const showAddButton =
    formMode.kind !== "create" && !allChannelsLinked && channels.length > 0;

  return (
    <div className="space-y-3" data-testid="channels-section">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          Connect this listing to channels you publish on. MBK will sync
          calendars in both directions every 15 minutes — block a date here
          and it propagates everywhere.
        </div>
        {showAddButton ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            data-testid="channels-section-add-button"
            className="whitespace-nowrap shrink-0"
          >
            <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
            Add channel
          </Button>
        ) : null}
      </div>

      {channelListings.length === 0 ? (
        <div
          data-testid="channels-section-empty-state"
          className="border-2 border-dashed rounded-lg p-6 text-center space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            No channels yet. Add Airbnb, VRBO, Furnished Finder, or Rotating
            Room to start syncing calendars.
          </p>
          {channels.length > 0 ? (
            <Button
              variant="primary"
              size="md"
              onClick={handleAdd}
              data-testid="channels-section-add-cta"
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              Add your first channel
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="channel-listings-list">
          {channelListings.map((cl) => (
            <ChannelListingRow
              key={cl.id}
              channelListing={cl}
              onEdit={() => handleEdit(cl)}
              onRemove={() => handleRemove(cl)}
              isRemoving={removingId === cl.id}
            />
          ))}
        </ul>
      )}

      {formMode.kind === "create" ? (
        <ChannelListingFormModal
          open
          listingId={listingId}
          availableChannels={availableChannels}
          onClose={handleClose}
        />
      ) : null}

      {formMode.kind === "edit" ? (
        <ChannelListingFormModal
          open
          listingId={listingId}
          availableChannels={availableChannels}
          existing={formMode.channelListing}
          onClose={handleClose}
        />
      ) : null}
    </div>
  );
}
