/**
 * Mirrors backend `ChannelResponse` Pydantic schema.
 *
 * Channels are reference data — operator-managed via DB seed only. The
 * frontend uses this to populate the "Add channel" dropdown and to
 * label channel rows on the listing detail page.
 */
export interface Channel {
  id: string;
  name: string;
  supports_ical_export: boolean;
  supports_ical_import: boolean;
  created_at: string;
}
