import type { PlaidItemStatus } from "./plaid-item-status";

/** What one "Sync now" did. */
export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  /** Bank rows already on file (a CSV import, a manual entry) that were not added again. */
  matched_existing: number;
  /** Second legs of a transfer between two connected accounts, folded into one transfer. */
  transfers_matched: number;
  status: PlaidItemStatus;
}
