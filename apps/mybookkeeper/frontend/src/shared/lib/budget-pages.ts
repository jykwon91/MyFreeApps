/** Where the budget and cash flow pages send the person to change what they count. */
export const BUDGET_LINK_PAGES = {
  categories: "/spending-categories",
} as const;

/** Chart height, shared by the chart and its skeleton so nothing jumps on load. */
export const CASH_FLOW_CHART_HEIGHT = 260;

/** The same height as a class, for the skeleton. Kept literal so Tailwind sees it. */
export const CASH_FLOW_CHART_HEIGHT_CLASS = "h-[260px]";
