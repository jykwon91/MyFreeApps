import { describe, it, expect } from "vitest";
import { useCalendarAttachmentsMode } from "@/app/features/calendar/useCalendarAttachmentsMode";
import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";

const ATTACHMENT: ListingBlackoutAttachment = {
  id: "att1",
  listing_blackout_id: "blackout1",
  storage_key: "calendar/att1.pdf",
  filename: "lease.pdf",
  content_type: "application/pdf",
  size_bytes: 1024,
  uploaded_by_user_id: "u1",
  uploaded_at: "2024-01-01T00:00:00Z",
  presigned_url: "https://example.com/att1",
};

describe("useCalendarAttachmentsMode", () => {
  it("returns loading when isLoading is true", () => {
    expect(useCalendarAttachmentsMode({ isLoading: true, attachments: undefined })).toBe("loading");
  });

  it("returns loading when isLoading is true even if attachments exist", () => {
    expect(useCalendarAttachmentsMode({ isLoading: true, attachments: [ATTACHMENT] })).toBe("loading");
  });

  it("returns list when attachments has items", () => {
    expect(useCalendarAttachmentsMode({ isLoading: false, attachments: [ATTACHMENT] })).toBe("list");
  });

  it("returns empty when attachments is undefined", () => {
    expect(useCalendarAttachmentsMode({ isLoading: false, attachments: undefined })).toBe("empty");
  });

  it("returns empty when attachments is empty array", () => {
    expect(useCalendarAttachmentsMode({ isLoading: false, attachments: [] })).toBe("empty");
  });
});
