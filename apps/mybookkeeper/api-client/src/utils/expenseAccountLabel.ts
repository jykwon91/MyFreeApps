import type { MonthlyExpenseTransaction } from "../types/monthly-expenses/monthly-expense-transaction";
import { financialAccountLabel } from "./financialAccountLabel";

/** Where a payment came from: "TDECU Checking ··4821 · TDECU", or null when no account is known. */
export function expenseAccountLabel(
  transaction: Pick<MonthlyExpenseTransaction, "account_name" | "account_institution" | "account_mask">,
): string | null {
  if (transaction.account_name === null) return null;
  const account = financialAccountLabel({ name: transaction.account_name, mask: transaction.account_mask });
  const institution = transaction.account_institution;
  return institution && institution !== transaction.account_name ? `${account} · ${institution}` : account;
}
