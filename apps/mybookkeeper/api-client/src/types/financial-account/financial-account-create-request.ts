import type { FinancialAccountType } from "./financial-account-type";

export interface FinancialAccountCreateRequest {
  name: string;
  account_type: FinancialAccountType;
  institution_name?: string | null;
  mask?: string | null;
  currency?: string;
  current_balance_cents?: number | null;
  balance_as_of?: string | null;
  mortgage_id?: string | null;
}
