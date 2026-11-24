import { PLAID_TYPE_CLASSIFICATION } from "../constants/plaidAccountClassification";
import type { FinancialAccount } from "../types/financial-account/financial-account";
import type { PlaidLinkAccount } from "../types/plaid/plaid-link-account";

/** Accounts a bank account may be linked to: open, not already synced from a bank. */
export function linkableFinancialAccounts(accounts: readonly FinancialAccount[]): FinancialAccount[] {
  return accounts.filter((account) => account.closed_on === null && account.plaid_item_id === null);
}

/**
 * The existing account this bank account most likely is: the one open,
 * unsynced account on the same side of the balance sheet with the same last
 * digits. None when there is no such account or more than one, so a guess is
 * never made for the person.
 */
export function suggestPlaidAccountMatch(
  linkAccount: PlaidLinkAccount,
  accounts: readonly FinancialAccount[],
): string | null {
  if (!linkAccount.mask) return null;
  const side = PLAID_TYPE_CLASSIFICATION[linkAccount.type];
  const candidates = linkableFinancialAccounts(accounts).filter(
    (account) => account.mask === linkAccount.mask && (side === undefined || account.classification === side),
  );
  return candidates.length === 1 ? candidates[0].id : null;
}

/** One suggestion per bank account, never the same existing account twice. */
export function suggestPlaidAccountMatches(
  linkAccounts: readonly PlaidLinkAccount[],
  accounts: readonly FinancialAccount[],
): Record<string, string | null> {
  const suggestions: Record<string, string | null> = {};
  const taken = new Set<string>();
  for (const linkAccount of linkAccounts) {
    const match = suggestPlaidAccountMatch(linkAccount, accounts);
    const free = match !== null && !taken.has(match) ? match : null;
    if (free !== null) taken.add(free);
    suggestions[linkAccount.id] = free;
  }
  return suggestions;
}
