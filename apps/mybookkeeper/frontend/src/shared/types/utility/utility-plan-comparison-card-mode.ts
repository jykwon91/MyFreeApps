/**
 * What the dashboard rate-comparison card should render.
 *
 * ``NO_BENCHMARK`` is distinct from ``CLEAR``: with nothing to compare against
 * the card cannot claim the plans are priced well, so it prompts the operator
 * to record a market rate instead of implying an all-clear it has not earned.
 * ``HIDDEN`` covers the operator who tracks no plans at all.
 */
export const UTILITY_PLAN_COMPARISON_CARD_MODES = {
  LOADING: "loading",
  ERROR: "error",
  HIDDEN: "hidden",
  NO_BENCHMARK: "no-benchmark",
  CLEAR: "clear",
  ABOVE_MARKET: "above-market",
} as const;

export type UtilityPlanComparisonCardMode =
  (typeof UTILITY_PLAN_COMPARISON_CARD_MODES)[keyof typeof UTILITY_PLAN_COMPARISON_CARD_MODES];
