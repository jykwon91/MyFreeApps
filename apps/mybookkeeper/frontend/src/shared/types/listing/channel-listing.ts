import type { Channel } from "./channel";

/**
 * Mirrors backend `ChannelListingResponse` Pydantic schema.
 *
 * One row per (listing, channel) pair the operator publishes on.
 * `ical_export_url` is the FULL URL the operator pastes into the channel's
 * import-calendar field; the channel's own iCal export URL the operator
 * pastes in the other direction lives in `ical_import_url`.
 */
export interface ChannelListing {
  id: string;
  listing_id: string;
  channel_id: string;
  channel: Channel | null;

  external_url: string | null;
  external_id: string | null;

  ical_import_url: string | null;
  last_imported_at: string | null;
  last_import_error: string | null;

  ical_export_token: string;
  ical_export_url: string;

  created_at: string;
  updated_at: string;
}
