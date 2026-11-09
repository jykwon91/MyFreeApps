import type { UtilityPlanRateType } from "../types/utility/utility-plan-rate-type";

export const UTILITY_PLAN_RATE_TYPES: readonly UtilityPlanRateType[] = [
  "fixed",
  "variable",
  "indexed",
  "regulated",
];

export const UTILITY_PLAN_RATE_TYPE_LABELS: Record<UtilityPlanRateType, string> = {
  fixed: "Fixed",
  variable: "Variable",
  indexed: "Indexed",
  regulated: "Regulated",
};

/**
 * Why each rate type behaves the way it does at renewal time. Shown next to
 * the selector so the operator understands why picking ``regulated`` silences
 * the renewal alert.
 */
export const UTILITY_PLAN_RATE_TYPE_HINTS: Record<UtilityPlanRateType, string> = {
  fixed: "Locked rate for the term. Alerts before the term ends.",
  variable: "Provider can reprice monthly — this is where a lapsed fixed plan lands.",
  indexed: "Tied to a published market index. Alerts before the term ends.",
  regulated: "Tariffed monopoly rate. No competing supplier, so no renewal alert.",
};
