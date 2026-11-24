import { INVESTMENT_ACCOUNT_TYPES } from "@mybookkeeper/api-client/constants/financialAccountTypes";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";

/** Open accounts that can hold securities, synced or kept by hand. */
export function investmentAccounts(accounts: readonly FinancialAccount[]): FinancialAccount[] {
  return accounts.filter((account) => account.closed_on === null && INVESTMENT_ACCOUNT_TYPES.includes(account.account_type));
}

/** The ones a holding can be added to by hand: not synced from a bank. */
export function manualInvestmentAccounts(accounts: readonly FinancialAccount[]): FinancialAccount[] {
  return investmentAccounts(accounts).filter((account) => account.plaid_item_id === null);
}
