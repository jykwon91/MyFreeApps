import type { ListingSource } from "@/shared/types/listing/listing-source";

/**
 * Per-source helper text for the external_id field.
 *
 * Source IDs come from different fields on each platform; the host doesn't
 * always know which one to paste. Hints reduce the support load on the
 * "what counts as the FF ID?" question.
 */
export const EXTERNAL_ID_SOURCE_HINTS: Record<ListingSource, string> = {
  FF: "Furnished Finder property ID or URL slug (e.g. 12345)",
  TNH: "Travel Nurse Housing listing ID",
  Airbnb: "Airbnb listing ID from the URL (e.g. 1234567)",
  direct: "Internal reference (optional, for your own bookkeeping)",
};

/**
 * Shape of an RTK Query error response when the backend returns a 4xx
 * with a `detail` body. Used by external-ID forms to surface server-side
 * conflict messages (409) verbatim, while falling back to a friendly
 * default for unknown shapes.
 */
export interface ExternalIdRequestErrorShape {
  data?: {
    detail?: string;
  };
  status?: number;
}
