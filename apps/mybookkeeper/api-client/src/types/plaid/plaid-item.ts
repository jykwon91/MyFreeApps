import type { PlaidItemStatus } from "./plaid-item-status";

/** One bank connection, as ``GET /plaid/items`` returns it. The access token never leaves the server. */
export interface PlaidItem {
  id: string;
  institution_name: string | null;
  status: PlaidItemStatus;
  /** Plaid's code for the last refusal, kept so the reason is visible. */
  error_code: string | null;
  last_synced_at: string | null;
  account_count: number;
  created_at: string;
}
