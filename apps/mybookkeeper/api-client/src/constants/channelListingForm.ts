/** Mirrors the limits in backend `schemas/listings/channel_listing_create_request.py`. */
export const CHANNEL_EXTERNAL_ID_MAX_LENGTH = 120;
export const CHANNEL_EXTERNAL_URL_MAX_LENGTH = 500;
export const CHANNEL_ICAL_URL_MAX_LENGTH = 1000;

export const CHANNEL_LISTING_FORM_PROBLEMS = {
  urlRequired: "Channel URL is required — that's the link to your listing on the channel.",
  urlInvalid: "Enter a web address that starts with http:// or https://.",
  icalInvalid: "Enter the calendar address as a web link that starts with http:// or https://.",
} as const;
