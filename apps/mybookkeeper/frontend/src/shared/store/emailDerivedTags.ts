import type { TagDescription } from "@reduxjs/toolkit/query";
import type { AppTag } from "./baseApi";

/**
 * Every cache tag whose data is derived from Gmail-extracted documents.
 *
 * A Gmail sync creates Documents, which produce Transactions, which in turn feed
 * a set of *derived* views — the dashboard summary, reconciliation discrepancies,
 * tax completeness, and the pending rent-receipt list. Those derived views are
 * cached under their own tags, so invalidating only "Document"/"Transaction"
 * leaves them serving stale data until a full page reload.
 *
 * Any code path that completes an extraction MUST invalidate this whole set.
 * Adding a new query that derives from transactions? Add its tag here too —
 * a tag missing from this list is a page that silently goes stale.
 *
 * `SignedLease`/`RECEIPTS_PENDING` looks out of place but is correct: pending
 * receipts are derived from rent transactions, not from lease edits. Likewise
 * `RentLedger` — allocations are derived from payment transactions on read.
 */
export const EMAIL_DERIVED_TAGS: TagDescription<AppTag>[] = [
  "Document",
  "Summary",
  "Transaction",
  "Reconciliation",
  "TaxReturn",
  "RentLedger",
  { type: "SignedLease", id: "RECEIPTS_PENDING" },
];

/** `EMAIL_DERIVED_TAGS` plus "Integration" — for the sync endpoints themselves. */
export const SYNC_INVALIDATED_TAGS: TagDescription<AppTag>[] = [
  "Integration",
  ...EMAIL_DERIVED_TAGS,
];
