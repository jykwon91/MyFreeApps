/**
 * Channel display + status helpers.
 *
 * The canonical channel list comes from the backend `/channels` endpoint
 * — never hard-code channel slugs in UI logic. These helpers operate on
 * already-fetched data.
 */
import type { ChannelListing } from "@/shared/types/listing/channel-listing";

export type ChannelImportStatus = "ok" | "error" | "pending";

/**
 * Derive the display status for a channel_listing's inbound iCal poll.
 *
 *  - `pending` — operator hasn't supplied an `ical_import_url`, OR they
 *    have but it hasn't been polled yet (`last_imported_at == null`).
 *  - `error`   — last poll recorded an error message.
 *  - `ok`      — last poll succeeded; the recorded timestamp is the
 *    most recent successful sync.
 */
export function deriveImportStatus(cl: ChannelListing): ChannelImportStatus {
  if (cl.ical_import_url == null || cl.ical_import_url === "") return "pending";
  if (cl.last_import_error != null && cl.last_import_error !== "") return "error";
  if (cl.last_imported_at == null) return "pending";
  return "ok";
}

/**
 * Human-readable "X minutes ago" / "Just now" for a channel's last sync.
 *
 * Returns null when there's nothing to display (e.g. no poll has run).
 * The 60-second floor uses "Just now" so a freshly-imported feed feels
 * responsive in the UI.
 */
export function formatLastImportedAt(iso: string | null): string | null {
  if (iso == null) return null;
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 60_000) return "Just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}
