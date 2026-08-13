/**
 * What the dashboard premium-comparison card should render.
 *
 * ``NO_BENCHMARK`` is distinct from ``CLEAR``: with nothing to compare against
 * the card cannot claim the policies are priced well, so it prompts the
 * operator to record a market premium instead of implying an all-clear it has
 * not earned. ``HIDDEN`` covers the operator who tracks no policies at all.
 */
export const INSURANCE_COMPARISON_CARD_MODES = {
  LOADING: "loading",
  ERROR: "error",
  HIDDEN: "hidden",
  NO_BENCHMARK: "no-benchmark",
  CLEAR: "clear",
  ABOVE_MARKET: "above-market",
} as const;

export type InsuranceComparisonCardMode =
  (typeof INSURANCE_COMPARISON_CARD_MODES)[keyof typeof INSURANCE_COMPARISON_CARD_MODES];
