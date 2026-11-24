import type { SecurityType } from "../types/investments/security-type";

/**
 * Mirrors ``SECURITY_TYPES`` in ``backend/app/core/investment_enums.py`` (Plaid's
 * own list with spaces as underscores), in the order the type picker lists them.
 */
export const SECURITY_TYPES = [
  "equity",
  "etf",
  "mutual_fund",
  "fixed_income",
  "cash",
  "cryptocurrency",
  "derivative",
  "loan",
  "other",
] as const;

export const SECURITY_TYPE_LABELS: Record<SecurityType, string> = {
  equity: "Stock",
  etf: "ETF",
  mutual_fund: "Mutual fund",
  fixed_income: "Bond",
  cash: "Cash",
  cryptocurrency: "Crypto",
  derivative: "Option or future",
  loan: "Loan",
  other: "Other",
};

/** One fixed color per type so the allocation chart reads the same everywhere. */
export const SECURITY_TYPE_COLORS: Record<SecurityType, string> = {
  equity: "#2563eb",
  etf: "#0891b2",
  mutual_fund: "#7c3aed",
  fixed_income: "#16a34a",
  cash: "#ca8a04",
  cryptocurrency: "#ea580c",
  derivative: "#db2777",
  loan: "#dc2626",
  other: "#64748b",
};

/** Mirrors ``backend/app/core/investment_enums.py`` limits. */
export const HOLDING_TICKER_MAX_LENGTH = 32;
export const HOLDING_NAME_MAX_LENGTH = 255;
export const HOLDING_QUANTITY_MAX_DECIMALS = 10;
export const HOLDING_PRICE_MAX_DECIMALS = 8;
export const HOLDING_MAX_QUANTITY = 1_000_000_000_000;
export const HOLDING_MAX_PRICE = 1_000_000_000;
export const HOLDING_TICKER_PATTERN = /^[A-Z0-9.\-/^]{1,32}$/;
