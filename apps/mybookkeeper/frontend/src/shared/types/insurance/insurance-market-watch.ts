import type { InsurancePolicyRateOutlook } from "@/shared/types/insurance/insurance-policy-rate-outlook";
import type { InsuranceRateFiling } from "@/shared/types/insurance/insurance-rate-filing";

/** Response for the dwelling-market rate watch. */
export interface InsuranceMarketWatch {
  outlooks: InsurancePolicyRateOutlook[];
  /** Recent filings across the whole market — the shortlist to call. */
  market_filings: InsuranceRateFiling[];
  has_any_increase: boolean;
  /** Set when the TDI feed could not be reached, so nothing was checked. */
  feed_unavailable_reason: string | null;
}
