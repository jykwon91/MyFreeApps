import type { Transaction } from "../types/transaction/transaction";

/**
 * The account a row moved money in, by label: "Chase Checking", or for a
 * transfer "Chase Checking → Sapphire". An account that no longer exists
 * (deleted, so not in the map) reads as unknown rather than vanishing.
 */
export function transactionAccountLabel(
  transaction: Pick<Transaction, "account_id" | "transfer_to_account_id">,
  accountMap: ReadonlyMap<string, string>,
  unknownLabel: string,
): string | null {
  const name = (id: string | null) => (id === null ? null : accountMap.get(id) ?? unknownLabel);
  const from = name(transaction.account_id);
  const to = name(transaction.transfer_to_account_id);
  if (from && to) return `${from} → ${to}`;
  return from ?? (to ? `→ ${to}` : null);
}
