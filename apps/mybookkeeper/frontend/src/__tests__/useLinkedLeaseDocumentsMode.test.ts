import { describe, it, expect } from "vitest";
import { useLinkedLeaseDocumentsMode } from "@/app/features/applicants/useLinkedLeaseDocumentsMode";
import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";

const mockAttachment: SignedLeaseAttachment = {
  id: "att-1",
  filename: "lease.pdf",
  content_type: "application/pdf",
  kind: "lease_agreement",
  presigned_url: "https://example.com/lease.pdf",
};

describe("useLinkedLeaseDocumentsMode", () => {
  it("returns 'loading' when isLoading is true", () => {
    expect(
      useLinkedLeaseDocumentsMode({ isLoading: true, attachments: [] }),
    ).toBe("loading");
  });

  it("returns 'loading' even when there are attachments (loading takes precedence)", () => {
    expect(
      useLinkedLeaseDocumentsMode({ isLoading: true, attachments: [mockAttachment] }),
    ).toBe("loading");
  });

  it("returns 'empty' when not loading and attachments is empty", () => {
    expect(
      useLinkedLeaseDocumentsMode({ isLoading: false, attachments: [] }),
    ).toBe("empty");
  });

  it("returns 'list' when not loading and attachments has items", () => {
    expect(
      useLinkedLeaseDocumentsMode({ isLoading: false, attachments: [mockAttachment] }),
    ).toBe("list");
  });
});
