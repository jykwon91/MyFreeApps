import type { ChannelListingFormValues } from "./channel-listing-form-values";

export type ChannelListingFormProblems = Partial<Record<keyof ChannelListingFormValues, string>>;
