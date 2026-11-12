import type { ChannelImportStatus } from "../types/listing/channel-import-status";
import type { ChannelListing } from "../types/listing/channel-listing";

/**
 * The display status of a channel's inbound iCal poll.
 *  - `pending`: no `ical_import_url` yet, or it hasn't been polled yet.
 *  - `error`: the last poll recorded an error.
 *  - `ok`: the last poll succeeded.
 */
export function deriveImportStatus(channelListing: ChannelListing): ChannelImportStatus {
  if (channelListing.ical_import_url == null || channelListing.ical_import_url === "") return "pending";
  if (channelListing.last_import_error != null && channelListing.last_import_error !== "") return "error";
  if (channelListing.last_imported_at == null) return "pending";
  return "ok";
}
