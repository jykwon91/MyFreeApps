import { useDeleteChannelListingMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import { useToast } from "@platform/mobile";
import { LISTING_CHANNEL_MESSAGES } from "../../constants/listingChannels";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy } from "../../lib/writeFailureCopy";

const COPY = deleteFailureCopy("channel");

export function useChannelListingActions(channelListing: ChannelListing) {
  const { showToast } = useToast();
  const [deleteChannelListing] = useDeleteChannelListingMutation();
  const removal = useWrite();

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteChannelListing({ listingId: channelListing.listing_id, channelListingId: channelListing.id }).unwrap());
    if (result === "done") showToast(LISTING_CHANNEL_MESSAGES.removed);
    if (result === "gone") showToast(LISTING_CHANNEL_MESSAGES.alreadyRemoved);
  }

  return { remove, isRemoving: removal.isBusy, failure: removal.failure && removal.failure !== "gone" ? COPY[removal.failure] : null };
}
