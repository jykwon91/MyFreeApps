/**
 * Unit tests for useAttachmentViewMode.
 *
 * Verifies the hook returns the correct discriminated-union value for each
 * content-type family handled by AttachmentViewer, plus the "unavailable"
 * branch when the URL is empty (storage object missing).
 */
import { describe, it, expect } from "vitest";
import { useAttachmentViewMode } from "@/app/features/leases/useAttachmentViewMode";

const URL = "https://example.com/signed";

describe("useAttachmentViewMode", () => {
  it("returns 'pdf' for application/pdf with a URL", () => {
    expect(useAttachmentViewMode({ url: URL, contentType: "application/pdf" })).toBe("pdf");
  });

  it("returns 'image' for image/jpeg with a URL", () => {
    expect(useAttachmentViewMode({ url: URL, contentType: "image/jpeg" })).toBe("image");
  });

  it("returns 'image' for image/png with a URL", () => {
    expect(useAttachmentViewMode({ url: URL, contentType: "image/png" })).toBe("image");
  });

  it("returns 'image' for image/webp with a URL", () => {
    expect(useAttachmentViewMode({ url: URL, contentType: "image/webp" })).toBe("image");
  });

  it("returns 'other' for DOCX with a URL", () => {
    expect(
      useAttachmentViewMode({
        url: URL,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("other");
  });

  it("returns 'other' for unknown content types with a URL", () => {
    expect(useAttachmentViewMode({ url: URL, contentType: "text/plain" })).toBe("other");
  });

  it("returns 'unavailable' when URL is empty regardless of content type", () => {
    expect(useAttachmentViewMode({ url: "", contentType: "application/pdf" })).toBe("unavailable");
    expect(useAttachmentViewMode({ url: "", contentType: "image/png" })).toBe("unavailable");
    expect(useAttachmentViewMode({ url: "", contentType: "text/plain" })).toBe("unavailable");
  });
});
