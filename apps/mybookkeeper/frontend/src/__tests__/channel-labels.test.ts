import { describe, it, expect } from "vitest";
import {
  deriveImportStatus,
  formatLastImportedAt,
} from "@/shared/lib/channel-labels";
import type { ChannelListing } from "@/shared/types/listing/channel-listing";

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

describe("formatLastImportedAt", () => {
  it("returns null for null input", () => {
    expect(formatLastImportedAt(null)).toBeNull();
  });

  it("renders 'Just now' within 60 seconds", () => {
    const now = new Date(Date.now() - 30_000).toISOString();
    expect(formatLastImportedAt(now)).toBe("Just now");
  });

  it("renders minutes ago for sub-hour durations", () => {
    const time = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatLastImportedAt(time)).toBe("5 min ago");
  });

  it("renders hours ago for sub-day durations", () => {
    const time = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatLastImportedAt(time)).toBe("3 hr ago");
  });

  it("renders days ago for older durations", () => {
    const time = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatLastImportedAt(time)).toBe("5 days ago");
  });

  it("uses singular 'day' for exactly 1 day", () => {
    const time = new Date(Date.now() - 26 * 60 * 60_000).toISOString();
    expect(formatLastImportedAt(time)).toBe("1 day ago");
  });
});
