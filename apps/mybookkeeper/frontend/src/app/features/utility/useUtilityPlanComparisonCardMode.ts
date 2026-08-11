import {
  UTILITY_PLAN_COMPARISON_CARD_MODES,
  type UtilityPlanComparisonCardMode,
} from "@/shared/types/utility/utility-plan-comparison-card-mode";

interface UseUtilityPlanComparisonCardModeArgs {
  isLoading: boolean;
  isError: boolean;
  /** Undefined until the comparison query resolves. */
  totalAboveMarket: number | undefined;
  /** Whether the operator tracks any plans at all. */
  hasAnyPlans: boolean;
  /** Whether any market rate has been recorded to compare against. */
  hasAnyBenchmark: boolean;
}

/**
 * Resolves what the dashboard rate-comparison card should render.
 *
 * The ``NO_BENCHMARK`` case is the one that carries the design: without a
 * recorded market rate the card must not fall through to "nothing to worry
 * about". Silence there would read as an all-clear when the truth is that
 * nothing was checked — which is exactly the failure this feature exists to
 * fix, since a plan can sit comfortably inside its term and still be the most
 * expensive line in the portfolio.
 */
export function useUtilityPlanComparisonCardMode({
  isLoading,
  isError,
  totalAboveMarket,
  hasAnyPlans,
  hasAnyBenchmark,
}: UseUtilityPlanComparisonCardModeArgs): UtilityPlanComparisonCardMode {
  if (isLoading) return UTILITY_PLAN_COMPARISON_CARD_MODES.LOADING;
  if (isError) return UTILITY_PLAN_COMPARISON_CARD_MODES.ERROR;
  if (!hasAnyPlans) return UTILITY_PLAN_COMPARISON_CARD_MODES.HIDDEN;
  if (!hasAnyBenchmark) return UTILITY_PLAN_COMPARISON_CARD_MODES.NO_BENCHMARK;
  if ((totalAboveMarket ?? 0) === 0) return UTILITY_PLAN_COMPARISON_CARD_MODES.CLEAR;
  return UTILITY_PLAN_COMPARISON_CARD_MODES.ABOVE_MARKET;
}
