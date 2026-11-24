import type { FinancialAccountClassification } from "../types/financial-account/financial-account-classification";

/**
 * Which side of the balance sheet each Plaid account type sits on, so a bank
 * account is only ever suggested for an existing account on the same side.
 */
export const PLAID_TYPE_CLASSIFICATION: Readonly<Record<string, FinancialAccountClassification>> = {
  depository: "asset",
  investment: "asset",
  credit: "liability",
  loan: "liability",
};
