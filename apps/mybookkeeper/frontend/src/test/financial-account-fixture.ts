import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { FINANCIAL_ACCOUNT_CLASSIFICATION } from "@mybookkeeper/api-client/constants/financialAccountTypes";

/** An open checking account with a balance; override anything. ``classification`` follows ``account_type``. */
export function aFinancialAccount(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
  const accountType = overrides.account_type ?? "checking";
  return {
    id: "acct-1",
    organization_id: "org-1",
    user_id: "user-1",
    name: "Chase Checking",
    institution_name: "Chase",
    account_type: accountType,
    classification: FINANCIAL_ACCOUNT_CLASSIFICATION[accountType],
    mask: "4821",
    currency: "USD",
    current_balance_cents: 250000,
    balance_as_of: "2026-11-01",
    closed_on: null,
    mortgage_id: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}
