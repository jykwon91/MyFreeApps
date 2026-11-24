/**
 * What kind of account a financial account is.
 *
 * Mirrors ``backend/app/core/financial_account_enums.py``; the backend refuses
 * any other value, so a type added on one side must be added on the other.
 */
export type FinancialAccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "loan"
  | "mortgage"
  | "brokerage"
  | "retirement"
  | "hsa"
  | "cash"
  | "other_asset"
  | "other_liability";
