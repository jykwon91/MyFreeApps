import type { FinancialAccount } from "../types/financial-account/financial-account";

/** How an account is named in a picker or a table cell: "Chase Checking ··4821". */
export function financialAccountLabel(account: Pick<FinancialAccount, "name" | "mask">): string {
  return account.mask ? `${account.name} ··${account.mask}` : account.name;
}
