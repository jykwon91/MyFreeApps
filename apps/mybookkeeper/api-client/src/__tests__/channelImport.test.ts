import { describe, it, expect } from "vitest";
import {
  deriveImportStatus,
} from "../utils/channelImport";
import type { ChannelListing } from "../types/listing/channel-listing";

const baseChannelListing: ChannelListing = {
  id: "cl-1",
  listing_id: "listing-1",
  channel_id: "airbnb",
  channel: null,
  external_url: "https://airbnb.com/x",
  external_id: null,
  ical_import_url: null,
  last_imported_at: null,
  last_import_error: null,
  ical_export_token: "tok",
  ical_export_url: "https://example.com/api/calendar/tok.ics",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("deriveImportStatus", () => {
  it("returns 'pending' when no inbound URL is set", () => {
    expect(deriveImportStatus(baseChannelListing)).toBe("pending");
  });

  it("returns 'pending' when URL set but no poll has run yet", () => {
    expect(
      deriveImportStatus({
        ...baseChannelListing,
        ical_import_url: "https://airbnb.com/cal.ics",
        last_imported_at: null,
      }),
    ).toBe("pending");
  });

  it("returns 'error' when last poll recorded an error", () => {
    expect(
      deriveImportStatus({
        ...baseChannelListing,
        ical_import_url: "https://airbnb.com/cal.ics",
        last_imported_at: "2026-04-29T00:00:00Z",
        last_import_error: "Timeout",
      }),
    ).toBe("error");
  });

  it("returns 'ok' when last poll succeeded", () => {
    expect(
      deriveImportStatus({
        ...baseChannelListing,
        ical_import_url: "https://airbnb.com/cal.ics",
        last_imported_at: "2026-04-29T00:00:00Z",
        last_import_error: null,
      }),
    ).toBe("ok");
  });
});
