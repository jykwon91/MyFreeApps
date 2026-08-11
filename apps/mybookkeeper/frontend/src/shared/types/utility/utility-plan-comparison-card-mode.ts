/**
 * What the dashboard rate-comparison card should render.
 *
 * ``no-benchmark`` is distinct from ``clear``: with nothing to compare against
 * the card cannot claim the plans are priced well, so it prompts the operator
 * to record a market rate instead of implying an all-clear it has not earned.
 * ``hidden`` covers the operator who tracks no plans at all.
 */
export type UtilityPlanComparisonCardMode =
  | "loading"
  | "error"
  | "hidden"
  | "no-benchmark"
  | "clear"
  | "above-market";
