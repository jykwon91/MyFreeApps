import type { TransactionScope } from "../transaction/TransactionScope";

/** What to do with one account Plaid Link returned: link it to an existing account, or add it (null). */
export interface PlaidAccountSelection {
  plaid_account_id: string;
  financial_account_id: string | null;
  default_transaction_scope: TransactionScope;
}
