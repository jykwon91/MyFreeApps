import type { TransactionScope } from "@mybookkeeper/api-client/types/transaction/TransactionScope";
import type { TransactionType } from "@mybookkeeper/api-client/types/transaction/TransactionType";

export interface TransactionFormValues {
  vendor: string;
  // Host-curated link to the Vendors rolodex (PR 4.2). Empty string means
  // "(none)" — the form serialiser converts it to ``null`` on submit so
  // the backend can detach an existing link.
  vendor_id: string;
  description: string;
  amount: string;
  transaction_type: TransactionType;
  category: string;
  property_id: string;
  tax_relevant: boolean;
  is_capital_improvement: boolean;
  payment_method: string;
  channel: string;
  transaction_date: string;
  tax_year: number;
  // Empty string means no account; the panel sends it as null.
  account_id: string;
  transfer_to_account_id: string;
  // Scope and personal spending category.
  transaction_scope: TransactionScope;
  // Empty string means no spending category; the panel sends it as null.
  spending_category_id: string;
}
