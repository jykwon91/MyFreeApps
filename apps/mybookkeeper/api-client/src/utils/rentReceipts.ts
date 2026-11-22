import type { SignedLeaseAttachment } from "../types/lease/signed-lease-attachment";

export const RENT_RECEIPT_KIND = "rent_receipt";

/** The rent receipts among a lease's files, in the order the server sent them. */
export function rentReceipts(attachments: readonly SignedLeaseAttachment[] | undefined): SignedLeaseAttachment[] {
  return (attachments ?? []).filter((attachment) => attachment.kind === RENT_RECEIPT_KIND);
}
