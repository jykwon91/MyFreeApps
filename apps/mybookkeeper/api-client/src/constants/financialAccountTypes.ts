import type { FinancialAccountClassification } from "../types/financial-account/financial-account-classification";
import type { FinancialAccountType } from "../types/financial-account/financial-account-type";

/** Every type, in the order the type picker lists them: what you have first, then what you owe. */
export const FINANCIAL_ACCOUNT_TYPES: readonly FinancialAccountType[] = [
  "checking",
  "savings",
  "brokerage",
  "retirement",
  "hsa",
  "cash",
  "other_asset",
  "credit_card",
  "loan",
  "mortgage",
  "other_liability",
];

export const FINANCIAL_ACCOUNT_TYPE_LABELS: Record<FinancialAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  brokerage: "Brokerage",
  retirement: "Retirement",
  hsa: "HSA",
  cash: "Cash",
  other_asset: "Other asset",
  credit_card: "Credit card",
  loan: "Loan",
  mortgage: "Mortgage",
  other_liability: "Other debt",
};

/** Mirrors ``ASSET_ACCOUNT_TYPES`` / ``LIABILITY_ACCOUNT_TYPES`` in the backend enums. */
export const FINANCIAL_ACCOUNT_CLASSIFICATION: Record<FinancialAccountType, FinancialAccountClassification> = {
  checking: "asset",
  savings: "asset",
  brokerage: "asset",
  retirement: "asset",
  hsa: "asset",
  cash: "asset",
  other_asset: "asset",
  credit_card: "liability",
  loan: "liability",
  mortgage: "liability",
  other_liability: "liability",
};

/** Mirrors ``INVESTMENT_ACCOUNT_TYPES``: the accounts that can hold securities. */
export const INVESTMENT_ACCOUNT_TYPES: readonly FinancialAccountType[] = ["brokerage", "retirement", "hsa"];

/** Only a mortgage account can be tied to a recorded mortgage. */
export const MORTGAGE_ACCOUNT_TYPE: FinancialAccountType = "mortgage";

export const FINANCIAL_ACCOUNT_NAME_MAX_LENGTH = 100;
export const FINANCIAL_ACCOUNT_INSTITUTION_MAX_LENGTH = 255;
export const FINANCIAL_ACCOUNT_MASK_MAX_LENGTH = 4;
export const FINANCIAL_ACCOUNT_MASK_PATTERN = /^[A-Za-z0-9]{2,4}$/;
