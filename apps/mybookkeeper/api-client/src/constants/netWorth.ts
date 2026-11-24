/**
 * Mirrors ``backend/app/core/net_worth_constants.py``: the chart ranges and
 * the groups, in the order the page shows them.
 */
export const NET_WORTH_RANGES = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
] as const;

export const NET_WORTH_DEFAULT_RANGE = "3m" as const;

export const NET_WORTH_GROUP_KEYS = [
  "cash",
  "investments",
  "property",
  "other_assets",
  "credit_cards",
  "loans",
  "other_liabilities",
] as const;

export const NET_WORTH_LINE_SOURCES = ["account", "mortgage", "property"] as const;
