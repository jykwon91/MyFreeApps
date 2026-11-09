/** Mirrors backend `ChannelListingCreateRequest`. */
export interface ChannelListingCreateRequest {
  channel_id: string;
  external_url: string;
  external_id?: string | null;
  ical_import_url?: string | null;
  ical_import_secret_token?: string | null;
}
