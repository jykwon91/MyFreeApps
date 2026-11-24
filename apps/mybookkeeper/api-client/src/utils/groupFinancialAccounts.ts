import type { FinancialAccount } from "../types/financial-account/financial-account";
import type { FinancialAccountGroups } from "../types/financial-account/financial-account-groups";

/** Open accounts split by what they are; closed ones set apart, so they never read as current. */
export function groupFinancialAccounts(accounts: readonly FinancialAccount[]): FinancialAccountGroups {
  const groups: FinancialAccountGroups = { assets: [], liabilities: [], closed: [] };
  for (const account of accounts) {
    if (account.closed_on !== null) groups.closed.push(account);
    else if (account.classification === "asset") groups.assets.push(account);
    else groups.liabilities.push(account);
  }
  return groups;
}

/** Accounts a transaction can be filed under: open ones, plus the one it already names. */
export function selectableFinancialAccounts(
  accounts: readonly FinancialAccount[],
  currentId: string | null,
): FinancialAccount[] {
  return accounts.filter((account) => account.closed_on === null || account.id === currentId);
}
