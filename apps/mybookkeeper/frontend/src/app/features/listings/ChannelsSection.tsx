import { useState } from "react";
import { Plus } from "lucide-react";
import LoadErrorAlert from "@/shared/components/ui/LoadErrorAlert";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";
import { Button, showError, showSuccess } from "@platform/ui";
import { LISTING_MESSAGES } from "@/shared/lib/listing-messages";
import {
  useDeleteChannelListingMutation,
  useGetChannelsQuery,
  useGetListingChannelsQuery,
} from "@mybookkeeper/api-client/store/listingsApi";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import ChannelListingsBody from "./ChannelListingsBody";
import ChannelListingFormModal from "./ChannelListingFormModal";
import type { ChannelListingFormTarget } from "@/shared/types/listing/channel-listing-form-target";

export interface ChannelsSectionProps {
  listingId: string;
  /** Viewers see the channels only: no add, edit or remove. */
  canWrite: boolean;
}

/**
 * "Channels" section on the listing detail page (PR 1.4).
 *
 * Owns the list / add-modal state. Lists existing channel_listings via
 * RTK Query (cache key per-listing); the "Add channel" button only
 * shows when there's at least one unlinked channel available. Empty
 * state pitches the operator on the first link.
 */
export default function ChannelsSection({ listingId, canWrite }: ChannelsSectionProps) {
  const { data, error, isFetching, refetch } = useGetListingChannelsQuery(listingId);
  const {
    data: channels = [],
    error: channelsError,
    isFetching: isChannelsFetching,
    refetch: refetchChannels,
  } = useGetChannelsQuery();
  const [deleteChannelListing] = useDeleteChannelListingMutation();

  // null while no form is open; `existing` is unset when adding a new link.
  const [formTarget, setFormTarget] = useState<ChannelListingFormTarget | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const channelListings = data ?? [];
  const mode = resolveListLoadMode({
    hasData: data !== undefined,
    hasError: error !== undefined,
    itemCount: channelListings.length,
  });

  const linkedChannelIds = new Set(channelListings.map((cl) => cl.channel_id));
  const availableChannels = channels.filter((c) => !linkedChannelIds.has(c.id));
  const allChannelsLinked =
    channels.length > 0 && availableChannels.length === 0;

  function handleAdd() {
    setFormTarget({});
  }

  function handleEdit(cl: ChannelListing) {
    setFormTarget({ existing: cl });
  }

  function handleClose() {
    setFormTarget(null);
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

  if (mode === "loading") {
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

  // Decided on `error`, not `isError`: RTK clears `isError` while Retry
  // refetches, which would flash the "no channels yet" pitch mid-retry.
  const loadError = error ? (
    <LoadErrorAlert
      message="I couldn't load the channels for this listing."
      isRetrying={isFetching}
      onRetry={() => refetch()}
    />
  ) : null;

  if (mode === "error") return loadError;

  const isAdding = formTarget !== null && formTarget.existing === undefined;
  const showAddButton =
    canWrite && !isAdding && !allChannelsLinked && channels.length > 0;

  return (
    <div className="space-y-3" data-testid="channels-section">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {canWrite ? LISTING_MESSAGES.channelsIntro : LISTING_MESSAGES.channelsIntroViewer}
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

      {loadError}

      {/* Without the channel list there's nothing to link, so the add
          buttons hide; say why instead of letting them vanish. */}
      {canWrite && channelsError ? (
        <LoadErrorAlert
          message="I couldn't load the channels you can link, so adding one isn't available right now."
          isRetrying={isChannelsFetching}
          onRetry={() => refetchChannels()}
        />
      ) : null}

      <ChannelListingsBody
        mode={mode}
        channelListings={channelListings}
        canWrite={canWrite}
        canAddFirst={channels.length > 0}
        removingId={removingId}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onRemove={(cl) => void handleRemove(cl)}
      />

      {canWrite && formTarget ? (
        <ChannelListingFormModal
          key={formTarget.existing?.id ?? "new"}
          open
          listingId={listingId}
          availableChannels={availableChannels}
          existing={formTarget.existing}
          onClose={handleClose}
        />
      ) : null}
    </div>
  );
}
