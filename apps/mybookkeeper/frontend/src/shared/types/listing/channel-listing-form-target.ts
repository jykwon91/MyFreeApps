import type { ChannelListing } from "./channel-listing";

/** The channel link a form is open for; `existing` is unset when adding a new one. */
export interface ChannelListingFormTarget {
  existing?: ChannelListing;
}
