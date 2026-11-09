import type { InsurancePremiumComparison } from "@mybookkeeper/api-client/types/insurance/insurance-premium-comparison";
import type { UtilityPlanRateComparison } from "@mybookkeeper/api-client/types/utility/utility-plan-rate-comparison";
import type { UtilityPlanRenewalAlert } from "@mybookkeeper/api-client/types/utility/utility-plan-renewal-alert";
import { aInsurancePolicySummary } from "./aInsurancePolicySummary";
import { aUtilityPlanSummary } from "./aUtilityPlanSummary";
import { noPremiumComparison, noRateComparison, noRenewalAlerts } from "./transactionsServer";

export function renewalsDue(lapsed: number, endingSoon: number): UtilityPlanRenewalAlert {
  const plans = (count: number, prefix: string) => Array.from({ length: count }, (_, index) => aUtilityPlanSummary({ id: `${prefix}${index}` }));
  return {
    ...noRenewalAlerts(),
    expired: plans(lapsed, "lapsed"),
    expiring_soon: plans(endingSoon, "soon"),
    total_needing_attention: lapsed + endingSoon,
  };
}

export function utilityPlansAboveMarket(count: number): UtilityPlanRateComparison {
  return {
    ...noRateComparison(),
    above_market: Array.from({ length: count }, (_, index) => ({
      plan: aUtilityPlanSummary({ id: `u${index}` }),
      status: "above_market" as const,
      plan_figure: "16.0000",
      benchmark_figure: "13.0000",
      gap_pct: "23.08",
      benchmark_is_stale: false,
    })),
    total_above_market: count,
  };
}

export function policiesAboveMarket(count: number): InsurancePremiumComparison {
  return {
    ...noPremiumComparison(),
    above_market: Array.from({ length: count }, (_, index) => ({
      policy: aInsurancePolicySummary({ id: `p${index}` }),
      status: "above_market" as const,
      policy_rate_cents_per_1000: "350",
      benchmark_rate_cents_per_1000: "280",
      gap_pct: "25.00",
      benchmark_is_stale: false,
    })),
    total_above_market: count,
    total_considered: count,
  };
}
