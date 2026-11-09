import { useCreateListingChannelMutation, useUpdateChannelListingMutation } from "@mybookkeeper/api-client/store/listingsApi";
import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";
import type { ChannelListingFormValues } from "@mybookkeeper/api-client/types/listing/channel-listing-form-values";
import { channelListingToCreateRequest, channelListingToUpdateRequest } from "@mybookkeeper/api-client/utils/channelListingForm";
import { useToast } from "@platform/mobile";
import { LISTING_CHANNEL_MESSAGES } from "../../constants/listingChannels";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Adds a channel to a listing, or saves `original`, and goes back when it's done. */
export function useSaveChannelListing(listingId: string, original: ChannelListing | null) {
  const { showToast } = useToast();
  const [createChannel] = useCreateListingChannelMutation();
  const [updateChannel] = useUpdateChannelListingMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved(`/listings/${listingId}/channels`);
  const copy = { ...saveFailureCopy("channel", "channels", original === null), conflict: LISTING_CHANNEL_MESSAGES.conflict };

  async function submit(values: ChannelListingFormValues): Promise<void> {
    const result = await write.run(
      () =>
        original
          ? updateChannel({ listingId, channelListingId: original.id, data: channelListingToUpdateRequest(values) }).unwrap()
          : createChannel({ listingId, data: channelListingToCreateRequest(values) }).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? LISTING_CHANNEL_MESSAGES.saved : LISTING_CHANNEL_MESSAGES.added);
    leave();
  }

  return { submit, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
