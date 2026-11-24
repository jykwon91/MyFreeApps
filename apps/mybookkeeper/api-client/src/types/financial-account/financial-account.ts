import type { FinancialAccountClassification } from "./financial-account-classification";
import type { FinancialAccountType } from "./financial-account-type";

/**
 * A bank, card, loan or investment account, as ``GET /financial-accounts`` returns it.
 *
 * A balance is always "the amount on the statement": what you have for an
 * asset, what you owe for a liability. It can be negative (an overdraft, a
 * card in credit). It is null until someone enters one, and then always comes
 * with the date it was true on.
 */
export interface FinancialAccount {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  institution_name: string | null;
  account_type: FinancialAccountType;
  classification: FinancialAccountClassification;
  /** The last 2 to 4 characters of the account number, never the whole number. */
  mask: string | null;
  /** ISO 4217, upper case. */
  currency: string;
  current_balance_cents: number | null;
  balance_as_of: string | null;
  closed_on: string | null;
  mortgage_id: string | null;
  created_at: string;
  updated_at: string;
}
