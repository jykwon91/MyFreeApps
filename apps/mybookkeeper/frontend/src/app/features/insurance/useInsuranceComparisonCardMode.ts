import {
  INSURANCE_COMPARISON_CARD_MODES,
  type InsuranceComparisonCardMode,
} from "@/shared/types/insurance/insurance-comparison-card-mode";

interface UseInsuranceComparisonCardModeArgs {
  isLoading: boolean;
  isError: boolean;
  /** Undefined until the comparison query resolves. */
  totalAboveMarket: number | undefined;
  /** Whether the operator tracks any policies at all. */
  hasAnyPolicies: boolean;
  /** Whether a market premium has been recorded to compare against. */
  hasBenchmark: boolean;
}

/**
 * Resolves what the dashboard premium-comparison card should render.
 *
 * The ``NO_BENCHMARK`` case is the one that carries the design: without a
 * recorded market premium the card must not fall through to "nothing to worry
 * about". Silence there would read as an all-clear when the truth is that
 * nothing was checked — and insurance is exactly where that gap bites, since a
 * policy renews itself quietly every year at whatever the carrier decides.
 */
export function useInsuranceComparisonCardMode({
  isLoading,
  isError,
  totalAboveMarket,
  hasAnyPolicies,
  hasBenchmark,
}: UseInsuranceComparisonCardModeArgs): InsuranceComparisonCardMode {
  if (isLoading) return INSURANCE_COMPARISON_CARD_MODES.LOADING;
  if (isError) return INSURANCE_COMPARISON_CARD_MODES.ERROR;
  if (!hasAnyPolicies) return INSURANCE_COMPARISON_CARD_MODES.HIDDEN;
  if (!hasBenchmark) return INSURANCE_COMPARISON_CARD_MODES.NO_BENCHMARK;
  if ((totalAboveMarket ?? 0) === 0) return INSURANCE_COMPARISON_CARD_MODES.CLEAR;
  return INSURANCE_COMPARISON_CARD_MODES.ABOVE_MARKET;
}
