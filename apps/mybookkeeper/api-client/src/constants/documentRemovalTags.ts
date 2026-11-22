import { RECEIPTS_PENDING_TAG } from "./receiptsPendingTag";

/**
 * What deleting a document or marking it reference-only refreshes: the document lists and counts, the
 * payments, the pending rent receipts, and the tax returns. Only reference-only removes the document's
 * payments; a deleted document's payments stay in the books.
 */
export const DOCUMENT_REMOVAL_TAGS = [
  "Document",
  "Summary",
  "Transaction",
  RECEIPTS_PENDING_TAG,
  "TaxReturn",
] as const;
