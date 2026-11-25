/**
 * Mirrors ``backend/app/core/monthly_expense_constants.py``: how many full
 * months the monthly expenses page averages, in the order the page shows them.
 * The scopes are the cash flow page's (``CASH_FLOW_SCOPES``).
 */
export const MONTHLY_EXPENSE_RANGES = [
  { key: "3m", label: "3M", months: 3 },
  { key: "6m", label: "6M", months: 6 },
  { key: "12m", label: "12M", months: 12 },
] as const;

export const MONTHLY_EXPENSE_DEFAULT_RANGE = "6m" as const;
