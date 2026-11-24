/**
 * Mirrors ``backend/app/core/budget_constants.py``: the cash flow ranges and
 * scopes, in the order the page shows them.
 */
export const CASH_FLOW_RANGES = [
  { key: "6m", label: "6M" },
  { key: "12m", label: "12M" },
  { key: "ytd", label: "YTD" },
] as const;

export const CASH_FLOW_DEFAULT_RANGE = "6m" as const;

export const CASH_FLOW_SCOPES = [
  { key: "all", label: "All" },
  { key: "personal", label: "Personal" },
  { key: "rental", label: "Rental" },
  { key: "business", label: "Business" },
] as const;

export const CASH_FLOW_DEFAULT_SCOPE = "all" as const;
