import { describe, expect, it } from "vitest";
import type { SignedLeaseAttachment } from "../types/lease/signed-lease-attachment";
import { rentReceipts } from "../utils/rentReceipts";

function aFile(id: string, kind: SignedLeaseAttachment["kind"]): SignedLeaseAttachment {
  return {
    id, lease_id: "l1", filename: `${id}.pdf`, storage_key: id, content_type: "application/pdf", size_bytes: 1,
    kind, uploaded_by_user_id: "u1", uploaded_at: "2026-03-02T12:00:00Z", presigned_url: null, is_available: true, is_locked: false,
  };
}

describe("rentReceipts", () => {
  it("keeps only the rent receipts, in order", () => {
    const files = [aFile("a", "rent_receipt"), aFile("b", "signed_lease"), aFile("c", "rent_receipt")];
    expect(rentReceipts(files).map((file) => file.id)).toEqual(["a", "c"]);
  });

  it("returns nothing for a lease that hasn't loaded", () => {
    expect(rentReceipts(undefined)).toEqual([]);
  });
});
