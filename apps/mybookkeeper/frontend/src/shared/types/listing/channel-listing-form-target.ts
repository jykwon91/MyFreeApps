import type { ChannelListing } from "@mybookkeeper/api-client/types/listing/channel-listing";

/** The channel link a form is open for; `existing` is unset when adding a new one. */
export interface ChannelListingFormTarget {
  existing?: ChannelListing;
}
