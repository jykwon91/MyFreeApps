import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/** Response for the dwelling-market rate watch. */
export interface InsuranceMarketWatch {
  outlooks: InsurancePolicyRateOutlook[];
  /** Carriers whose next dwelling rate rises — who not to move to. */
  market_rising: InsuranceRateFiling[];
  /** Carriers holding flat or cutting — the shortlist worth an agent call. */
  market_flat: InsuranceRateFiling[];
  has_any_increase: boolean;
  /** Policies actually checked — excludes forms this feed does not cover. */
  checked_policy_count: number;
  /** Set when the TDI feed could not be reached, so nothing was checked. */
  feed_unavailable_reason: string | null;
}
