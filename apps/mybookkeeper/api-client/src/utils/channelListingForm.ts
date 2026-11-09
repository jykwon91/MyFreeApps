import { CHANNEL_LISTING_FORM_PROBLEMS } from "../constants/channelListingForm";
import type { ChannelListing } from "../types/listing/channel-listing";
import type { ChannelListingCreateRequest } from "../types/listing/channel-listing-create-request";
import type { ChannelListingFormProblems } from "../types/listing/channel-listing-form-problems";
import type { ChannelListingFormValues } from "../types/listing/channel-listing-form-values";
import type { ChannelListingUpdateRequest } from "../types/listing/channel-listing-update-request";
import { HTTP_URL_PATTERN } from "./externalIdForm";

export function emptyChannelListingForm(channelId: string): ChannelListingFormValues {
  return { channel_id: channelId, external_url: "", external_id: "", ical_import_url: "" };
}

export function channelListingToFormValues(channelListing: ChannelListing): ChannelListingFormValues {
  return {
    channel_id: channelListing.channel_id,
    external_url: channelListing.external_url ?? "",
    external_id: channelListing.external_id ?? "",
    ical_import_url: channelListing.ical_import_url ?? "",
  };
}

export function channelListingFormProblems(values: ChannelListingFormValues): ChannelListingFormProblems {
  const problems: ChannelListingFormProblems = {};
  const url = values.external_url.trim();
  const ical = values.ical_import_url.trim();
  if (!url) problems.external_url = CHANNEL_LISTING_FORM_PROBLEMS.urlRequired;
  else if (!HTTP_URL_PATTERN.test(url)) problems.external_url = CHANNEL_LISTING_FORM_PROBLEMS.urlInvalid;
  if (ical && !HTTP_URL_PATTERN.test(ical)) problems.ical_import_url = CHANNEL_LISTING_FORM_PROBLEMS.icalInvalid;
  return problems;
}

export function channelListingToCreateRequest(values: ChannelListingFormValues): ChannelListingCreateRequest {
  return {
    channel_id: values.channel_id,
    external_url: values.external_url.trim(),
    external_id: values.external_id.trim() || null,
    ical_import_url: values.ical_import_url.trim() || null,
  };
}

/** Every editable field is sent, because the form starts from the saved values. */
export function channelListingToUpdateRequest(values: ChannelListingFormValues): ChannelListingUpdateRequest {
  return {
    external_url: values.external_url.trim(),
    external_id: values.external_id.trim() || null,
    ical_import_url: values.ical_import_url.trim() || null,
  };
}

export function sameChannelListingForm(a: ChannelListingFormValues, b: ChannelListingFormValues): boolean {
  return (Object.keys(a) as (keyof ChannelListingFormValues)[]).every((field) => a[field].trim() === b[field].trim());
}
