import type { ListingSource } from "../types/listing/listing-source";

/** Mirrors the String() lengths on the backend `ListingExternalId` model and schema. */
export const EXTERNAL_ID_MAX_LENGTH = 100;
export const EXTERNAL_URL_MAX_LENGTH = 500;

/** Source IDs come from different fields on each platform; the hint says which one to paste. */
export const EXTERNAL_ID_SOURCE_HINTS: Record<ListingSource, string> = {
  FF: "Furnished Finder property ID or URL slug (e.g. 12345)",
  TNH: "Travel Nurse Housing listing ID",
  Airbnb: "Airbnb listing ID from the URL (e.g. 1234567)",
  direct: "Internal reference (optional, for your own bookkeeping)",
};

export const EXTERNAL_ID_FORM_PROBLEMS = {
  needsOne: "Enter at least an external ID or a URL — a row with neither has nothing to link to.",
  urlInvalid: "Enter a web address that starts with http:// or https://.",
} as const;
