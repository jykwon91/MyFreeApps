/**
 * Unit tests for useAttachmentViewMode.
 *
 * Verifies the hook returns the correct discriminated-union value for each
 * content-type family handled by AttachmentViewer.
 */
import { describe, it, expect } from "vitest";
import { useAttachmentViewMode } from "@/app/features/leases/useAttachmentViewMode";

// Call the pure function directly — it has no React state, so no renderHook needed.

describe("useAttachmentViewMode", () => {
  it("returns 'pdf' for application/pdf", () => {
    expect(useAttachmentViewMode({ contentType: "application/pdf" })).toBe("pdf");
  });

  it("returns 'image' for image/jpeg", () => {
    expect(useAttachmentViewMode({ contentType: "image/jpeg" })).toBe("image");
  });

  it("returns 'image' for image/png", () => {
    expect(useAttachmentViewMode({ contentType: "image/png" })).toBe("image");
  });

  it("returns 'image' for image/webp", () => {
    expect(useAttachmentViewMode({ contentType: "image/webp" })).toBe("image");
  });

  it("returns 'other' for DOCX", () => {
    expect(
      useAttachmentViewMode({
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("other");
  });

  it("returns 'other' for unknown content types", () => {
    expect(useAttachmentViewMode({ contentType: "text/plain" })).toBe("other");
    expect(useAttachmentViewMode({ contentType: "" })).toBe("other");
  });
});
