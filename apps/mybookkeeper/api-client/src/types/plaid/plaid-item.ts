import type { PlaidInvestmentsStatus } from "./plaid-investments-status";
import type { PlaidItemStatus } from "./plaid-item-status";

/** One bank connection, as ``GET /plaid/items`` returns it. The access token never leaves the server. */
export interface PlaidItem {
  id: string;
  institution_name: string | null;
  status: PlaidItemStatus;
  /** Plaid's code for the last refusal, kept so the reason is visible. */
  error_code: string | null;
  last_synced_at: string | null;
  /** Null until a sync first asks for holdings; ``consent_required`` offers "Add investments". */
  investments_status: PlaidInvestmentsStatus | null;
  holdings_synced_at: string | null;
  account_count: number;
  created_at: string;
}
