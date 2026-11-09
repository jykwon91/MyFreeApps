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

/** "Just now", "5 min ago", "3 hr ago", "2 days ago"; null when no poll has run. */
export function formatLastImportedAt(iso: string | null, now: number = Date.now()): string | null {
  if (iso == null) return null;
  const diffMs = now - new Date(iso).getTime();
  if (diffMs < 60_000) return "Just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}
